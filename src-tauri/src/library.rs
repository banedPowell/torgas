//! Bibliothèque desktop : base SQLite (`db::Library`), fichiers dans `~/Torgas/`,
//! miniatures dans `<app_data_dir>/covers/`, archives CBZ ouvertes en cache LRU.
//!
//! Ce module ne dépend pas de Tauri : les commandes ([`crate::commands`]) et le
//! protocole ([`crate::protocol`]) n'en sont que des adaptateurs, et il se teste
//! sur un dossier temporaire.

use std::fs;
use std::num::NonZeroUsize;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

use lru::LruCache;
use serde::Serialize;
use torgas_core::db::{ImportOptions, ImportOutcome, Library};
use torgas_core::thumbnail::{self, MAX_THUMBNAIL_WIDTH};
use torgas_core::{
    Bookmark, CbzArchive, CoreError, Format, Locator, Page, ReadingDirection, ReadingStatus,
    Series, Work, analyze, hash,
};

use crate::error::{DesktopError, Result};
use crate::storage;

/// Nom du fichier de base dans le dossier de données de l'app.
pub const DATABASE_FILE: &str = "library.sqlite3";

/// Archives CBZ gardées ouvertes (en mémoire) : l'œuvre lue et les précédentes.
const OPEN_ARCHIVES: usize = 3;

/// Préfixe des URL de couverture enregistrées en base. L'app le convertit en
/// URL propre à la plateforme (`convertFileSrc`).
pub const COVER_URL_PREFIX: &str = "torgas://cover/";

/// Résultat d'un import, tel que l'attend l'app (`ImportResult` côté TypeScript).
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportResult {
    /// `imported`, `duplicate`, `drm`, `unsupported` ou `error`.
    pub status: ImportStatus,
    /// Œuvre créée ou déjà présente.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub work: Option<Work>,
    /// Détail technique (erreur du cœur).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
}

/// Issue d'un import.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ImportStatus {
    /// Œuvre ajoutée.
    Imported,
    /// Même fichier (SHA-256) déjà présent.
    Duplicate,
    /// EPUB protégé par une DRM : refusé.
    Drm,
    /// Ni EPUB ni CBZ.
    Unsupported,
    /// Autre erreur (disque, base…).
    Error,
}

impl ImportResult {
    fn refused(status: ImportStatus, message: impl Into<String>) -> Self {
        Self {
            status,
            work: None,
            message: Some(message.into()),
        }
    }
}

type SharedArchive = Arc<Mutex<CbzArchive<Vec<u8>>>>;

/// État de la coquille desktop, partagé entre commandes et protocole.
pub struct Desktop {
    library: Mutex<Library>,
    library_dir: PathBuf,
    covers_dir: PathBuf,
    archives: Mutex<LruCache<String, SharedArchive>>,
}

impl Desktop {
    /// Ouvre la bibliothèque : fichiers dans `library_dir`, base et couvertures
    /// dans `data_dir`. Les dossiers sont créés au besoin.
    pub fn open(library_dir: impl Into<PathBuf>, data_dir: &Path) -> Result<Self> {
        let library_dir = library_dir.into();
        let covers_dir = data_dir.join("covers");
        fs::create_dir_all(&library_dir)?;
        fs::create_dir_all(&covers_dir)?;
        let library = Library::open(data_dir.join(DATABASE_FILE))?;
        Ok(Self::with_library(library, library_dir, covers_dir))
    }

    fn with_library(library: Library, library_dir: PathBuf, covers_dir: PathBuf) -> Self {
        let capacity = NonZeroUsize::new(OPEN_ARCHIVES).unwrap_or(NonZeroUsize::MIN);
        Self {
            library: Mutex::new(library),
            library_dir,
            covers_dir,
            archives: Mutex::new(LruCache::new(capacity)),
        }
    }

    /// Dossier de la bibliothèque sur disque.
    pub fn library_dir(&self) -> &Path {
        &self.library_dir
    }

    /// Importe un fichier : dédoublonnage par SHA-256, analyse, copie dans la
    /// bibliothèque, miniature de couverture, insertion en base.
    ///
    /// Les refus attendus (doublon, DRM, format) sont des [`ImportResult`], pas
    /// des erreurs ; une erreur de disque ou de base donne le statut `error`.
    pub fn import_file(&self, name: &str, bytes: &[u8]) -> ImportResult {
        match self.try_import(name, bytes) {
            Ok(result) => result,
            Err(DesktopError::Core(err @ (CoreError::Unsupported(_) | CoreError::Zip(_)))) => {
                ImportResult::refused(ImportStatus::Unsupported, err.to_string())
            }
            Err(err) => ImportResult::refused(ImportStatus::Error, err.to_string()),
        }
    }

    fn try_import(&self, name: &str, bytes: &[u8]) -> Result<ImportResult> {
        let sha256 = hash::sha256(bytes);
        if let Some(work) = self.library.lock()?.find_by_sha256(&sha256)? {
            return Ok(duplicate(work));
        }
        let analysis = analyze(name, bytes)?;
        if analysis.drm {
            return Ok(ImportResult::refused(
                ImportStatus::Drm,
                "fichier protégé par une DRM",
            ));
        }
        let path = storage::store(&self.library_dir, &analysis, bytes)?;
        let cover_url = analysis
            .cover
            .as_ref()
            .and_then(|cover| self.write_cover(&analysis.sha256, cover).ok());
        let options = ImportOptions {
            path: Some(path.to_string_lossy().into_owned()),
            cover_url,
        };
        let outcome = self.library.lock()?.import_analysis(&analysis, &options);
        match outcome {
            Ok(ImportOutcome::Imported { work }) => Ok(ImportResult {
                status: ImportStatus::Imported,
                work: Some(work),
                message: None,
            }),
            // Import concurrent du même fichier : on garde la première copie.
            Ok(ImportOutcome::Duplicate { work }) => {
                let _ = fs::remove_file(&path);
                Ok(duplicate(work))
            }
            Err(err) => {
                let _ = fs::remove_file(&path);
                Err(err.into())
            }
        }
    }

    /// Écrit la miniature JPEG ; renvoie l'URL `torgas://cover/<sha256>`.
    /// Une couverture illisible (AVIF…) n'empêche pas l'import.
    fn write_cover(&self, sha256: &str, cover: &Page) -> Result<String> {
        let thumb = thumbnail::make(&cover.bytes, MAX_THUMBNAIL_WIDTH)?;
        storage::write_atomic(&self.cover_path(sha256), &thumb.bytes)?;
        Ok(format!("{COVER_URL_PREFIX}{sha256}"))
    }

    fn cover_path(&self, sha256: &str) -> PathBuf {
        self.covers_dir.join(format!("{sha256}.jpg"))
    }

    /// Toutes les œuvres.
    pub fn list_works(&self) -> Result<Vec<Work>> {
        Ok(self.library.lock()?.list_works()?)
    }

    /// Une œuvre.
    pub fn get_work(&self, id: &str) -> Result<Option<Work>> {
        Ok(self.library.lock()?.get_work(id)?)
    }

    /// Toutes les séries.
    pub fn list_series(&self) -> Result<Vec<Series>> {
        Ok(self.library.lock()?.list_series()?)
    }

    /// Change le statut de lecture.
    pub fn set_status(&self, id: &str, status: ReadingStatus) -> Result<()> {
        self.library.lock()?.set_status(id, status)?;
        Ok(())
    }

    /// Change le sens de lecture d'une série.
    pub fn set_series_direction(&self, id: &str, direction: ReadingDirection) -> Result<()> {
        self.library.lock()?.set_series_direction(id, direction)?;
        Ok(())
    }

    /// Contenu du fichier d'une œuvre.
    pub fn book_bytes(&self, id: &str) -> Result<Vec<u8>> {
        let path = self.book_path(id)?;
        fs::read(&path).map_err(|err| match err.kind() {
            std::io::ErrorKind::NotFound => DesktopError::MissingFile(id.to_owned()),
            _ => err.into(),
        })
    }

    fn book_path(&self, id: &str) -> Result<PathBuf> {
        self.library
            .lock()?
            .file_path(id)?
            .map(PathBuf::from)
            .ok_or_else(|| DesktopError::MissingFile(id.to_owned()))
    }

    /// Page `index` (à partir de 0) du CBZ d'une œuvre. Les archives sont
    /// gardées ouvertes dans un cache LRU.
    pub fn page(&self, work_id: &str, index: usize) -> Result<Page> {
        let archive = self.archive(work_id)?;
        let mut archive = archive.lock()?;
        Ok(archive.page(index)?)
    }

    fn archive(&self, work_id: &str) -> Result<SharedArchive> {
        if let Some(archive) = self.archives.lock()?.get(work_id) {
            return Ok(Arc::clone(archive));
        }
        // Lecture hors du verrou du cache : un gros CBZ ne bloque pas les autres.
        let work = self
            .get_work(work_id)?
            .ok_or_else(|| DesktopError::Core(not_found("œuvre", work_id)))?;
        if work.format != Format::Cbz {
            return Err(DesktopError::BadRequest(format!(
                "l'œuvre {work_id} n'est pas un CBZ"
            )));
        }
        let archive = Arc::new(Mutex::new(CbzArchive::open(self.book_bytes(work_id)?)?));
        let mut cache = self.archives.lock()?;
        Ok(Arc::clone(
            cache.get_or_insert(work_id.to_owned(), || archive),
        ))
    }

    /// Miniature JPEG d'une couverture.
    pub fn cover(&self, sha256: &str) -> Result<Vec<u8>> {
        fs::read(self.cover_path(sha256)).map_err(|err| match err.kind() {
            std::io::ErrorKind::NotFound => DesktopError::Core(not_found("couverture", sha256)),
            _ => err.into(),
        })
    }

    /// Dernière position de lecture.
    pub fn get_locator(&self, id: &str) -> Result<Option<Locator>> {
        Ok(self.library.lock()?.get_locator(id)?)
    }

    /// Enregistre la position de lecture.
    pub fn save_locator(&self, id: &str, locator: &Locator) -> Result<()> {
        self.library.lock()?.save_locator(id, locator)?;
        Ok(())
    }

    /// Marque-pages d'une œuvre.
    pub fn list_bookmarks(&self, id: &str) -> Result<Vec<Bookmark>> {
        Ok(self.library.lock()?.list_bookmarks(id)?)
    }

    /// Ajoute un marque-page.
    pub fn add_bookmark(&self, id: &str, locator: &Locator, label: &str) -> Result<Bookmark> {
        Ok(self.library.lock()?.add_bookmark(id, locator, label)?)
    }

    /// Supprime un marque-page.
    pub fn remove_bookmark(&self, id: &str) -> Result<()> {
        Ok(self.library.lock()?.remove_bookmark(id)?)
    }

    /// Ouvre une session de lecture ; renvoie son identifiant.
    pub fn start_session(&self, work_id: &str) -> Result<String> {
        Ok(self.library.lock()?.start_session(work_id)?.id)
    }

    /// Clôt une session de lecture.
    pub fn end_session(&self, id: &str, minutes: f64, progress: f64) -> Result<()> {
        self.library
            .lock()?
            .end_session(id, minutes, Some(progress))?;
        Ok(())
    }
}

fn duplicate(work: Work) -> ImportResult {
    ImportResult {
        status: ImportStatus::Duplicate,
        work: Some(work),
        message: None,
    }
}

fn not_found(kind: &'static str, id: &str) -> CoreError {
    CoreError::NotFound {
        kind,
        id: id.to_owned(),
    }
}

#[cfg(test)]
pub(crate) mod tests {
    use super::*;
    use crate::test_fixtures::{cbz, epub};

    pub(crate) fn desktop() -> (tempfile::TempDir, Desktop) {
        let dir = tempfile::tempdir().unwrap();
        let desktop = Desktop::open(dir.path().join("Torgas"), &dir.path().join("data")).unwrap();
        (dir, desktop)
    }

    #[test]
    fn imports_an_epub_and_stores_it_by_author() {
        let (dir, desktop) = desktop();
        let bytes = epub("Le Livre", "Jeanne Autrice", false);
        let result = desktop.import_file("livre.epub", &bytes);
        assert_eq!(result.status, ImportStatus::Imported, "{result:?}");
        let work = result.work.unwrap();
        assert_eq!(work.title, "Le Livre");
        let stored = dir.path().join("Torgas/Jeanne Autrice/Le Livre.epub");
        assert_eq!(fs::read(&stored).unwrap(), bytes);
        assert_eq!(desktop.book_bytes(&work.id).unwrap(), bytes);
        assert_eq!(desktop.list_works().unwrap().len(), 1);
    }

    #[test]
    fn deduplicates_by_sha256_without_copying_again() {
        let (dir, desktop) = desktop();
        let bytes = epub("Doublon", "A", false);
        let first = desktop.import_file("a.epub", &bytes);
        let second = desktop.import_file("autre-nom.epub", &bytes);
        assert_eq!(second.status, ImportStatus::Duplicate);
        assert_eq!(second.work.unwrap().id, first.work.unwrap().id);
        let files = fs::read_dir(dir.path().join("Torgas/A")).unwrap().count();
        assert_eq!(files, 1);
    }

    #[test]
    fn refuses_drm_and_unsupported_files() {
        let (dir, desktop) = desktop();
        let drm = desktop.import_file("drm.epub", &epub("Verrou", "B", true));
        assert_eq!(drm.status, ImportStatus::Drm);
        let text = desktop.import_file("notes.txt", b"pas un livre");
        assert_eq!(text.status, ImportStatus::Unsupported);
        assert_eq!(desktop.list_works().unwrap(), Vec::new());
        assert!(!dir.path().join("Torgas/B").exists());
    }

    #[test]
    fn serves_cbz_pages_and_cover() {
        let (dir, desktop) = desktop();
        let result = desktop.import_file("Ma Serie v02.cbz", &cbz(3));
        assert_eq!(result.status, ImportStatus::Imported, "{result:?}");
        let work = result.work.unwrap();
        assert_eq!(work.page_count, Some(3));
        assert!(dir.path().join("Torgas/Ma Serie/Ma Serie v02.cbz").exists());
        assert_eq!(
            work.cover_url.as_deref(),
            Some(format!("{COVER_URL_PREFIX}{}", work.sha256).as_str())
        );
        let page = desktop.page(&work.id, 2).unwrap();
        assert_eq!(page.mime, "image/png");
        assert!(desktop.page(&work.id, 3).is_err());
        let cover = desktop.cover(&work.sha256).unwrap();
        assert_eq!(&cover[..2], &[0xFF, 0xD8], "miniature JPEG");
        assert_eq!(
            desktop.cover(&"f".repeat(64)).unwrap_err().code(),
            "not_found"
        );
    }

    #[test]
    fn refuses_pages_of_an_epub() {
        let (_dir, desktop) = desktop();
        let work = desktop
            .import_file("x.epub", &epub("X", "Y", false))
            .work
            .unwrap();
        assert_eq!(desktop.page(&work.id, 0).unwrap_err().code(), "invalid");
        assert_eq!(desktop.page("inconnue", 0).unwrap_err().code(), "not_found");
    }

    #[test]
    fn reading_state_round_trip() {
        let (_dir, desktop) = desktop();
        let work = desktop.import_file("Serie v01.cbz", &cbz(2)).work.unwrap();
        let series_id = work.series_id.clone().unwrap();

        desktop.set_status(&work.id, ReadingStatus::Paused).unwrap();
        desktop
            .set_series_direction(&series_id, ReadingDirection::Rtl)
            .unwrap();
        assert_eq!(
            desktop.list_series().unwrap()[0].direction,
            ReadingDirection::Rtl
        );

        let locator = Locator {
            format: Format::Cbz,
            cfi: None,
            page: Some(1),
            progress: 0.5,
        };
        desktop.save_locator(&work.id, &locator).unwrap();
        assert_eq!(
            desktop.get_locator(&work.id).unwrap(),
            Some(locator.clone())
        );
        assert_eq!(
            desktop.get_work(&work.id).unwrap().unwrap().status,
            ReadingStatus::Reading
        );

        let bookmark = desktop.add_bookmark(&work.id, &locator, " p. 2 ").unwrap();
        assert_eq!(
            desktop.list_bookmarks(&work.id).unwrap(),
            vec![bookmark.clone()]
        );
        desktop.remove_bookmark(&bookmark.id).unwrap();
        assert_eq!(desktop.list_bookmarks(&work.id).unwrap(), Vec::new());

        let session = desktop.start_session(&work.id).unwrap();
        desktop.end_session(&session, 12.5, 0.5).unwrap();
        assert_eq!(
            desktop
                .end_session("inconnue", 1.0, 0.5)
                .unwrap_err()
                .code(),
            "not_found"
        );
    }

    #[test]
    fn persists_across_reopen() {
        let dir = tempfile::tempdir().unwrap();
        let data = dir.path().join("data");
        let id = {
            let desktop = Desktop::open(dir.path().join("Torgas"), &data).unwrap();
            desktop
                .import_file("a.epub", &epub("A", "B", false))
                .work
                .unwrap()
                .id
        };
        let desktop = Desktop::open(dir.path().join("Torgas"), &data).unwrap();
        assert_eq!(desktop.get_work(&id).unwrap().unwrap().title, "A");
    }
}
