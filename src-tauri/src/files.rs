//! Fichiers venus du système : déposés sur la fenêtre, ouverts par association
//! (`.epub`, `.cbz`) ou passés en ligne de commande.
//!
//! Ils sont mis en attente puis signalés à l'app par l'événement
//! [`OPENED_FILES_EVENT`] ; l'app les récupère (`take_opened_files`), les lit
//! (`read_opened_file`) et les importe par sa file d'import habituelle.
//! Seuls ces fichiers-là peuvent être lus : l'app n'a pas d'accès libre au disque.

use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use serde::Serialize;

use crate::error::{DesktopError, Result};

/// Événement émis quand des fichiers attendent d'être importés (sans charge utile).
pub const OPENED_FILES_EVENT: &str = "torgas:opened-files";

/// Fichier en attente d'import.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenedFile {
    /// Chemin absolu (à repasser à `read_opened_file`).
    pub path: String,
    /// Nom du fichier.
    pub name: String,
    /// Taille en octets.
    pub size_bytes: u64,
}

/// File des fichiers ouverts et liste des chemins que l'app a le droit de lire.
#[derive(Debug, Default)]
pub struct OpenedFiles {
    pending: Mutex<Vec<OpenedFile>>,
    allowed: Mutex<HashSet<PathBuf>>,
}

impl OpenedFiles {
    /// Met en attente les fichiers ordinaires parmi `paths` (dossiers et chemins
    /// absents ignorés). Renvoie le nombre de fichiers ajoutés.
    pub fn register<P: AsRef<Path>>(&self, paths: impl IntoIterator<Item = P>) -> Result<usize> {
        let mut added = Vec::new();
        for path in paths {
            let Ok(path) = path.as_ref().canonicalize() else {
                continue;
            };
            let Ok(meta) = path.metadata() else { continue };
            if !meta.is_file() {
                continue;
            }
            let name = path
                .file_name()
                .map(|name| name.to_string_lossy().into_owned())
                .unwrap_or_default();
            added.push((
                path.clone(),
                OpenedFile {
                    path: path.to_string_lossy().into_owned(),
                    name,
                    size_bytes: meta.len(),
                },
            ));
        }
        let count = added.len();
        let mut allowed = self.allowed.lock()?;
        let mut pending = self.pending.lock()?;
        for (path, file) in added {
            allowed.insert(path);
            pending.push(file);
        }
        Ok(count)
    }

    /// Vide et renvoie la file d'attente.
    pub fn take_pending(&self) -> Result<Vec<OpenedFile>> {
        Ok(std::mem::take(&mut *self.pending.lock()?))
    }

    /// Autorise une seule lecture de `path` s'il a été ouvert ou déposé.
    pub fn authorize(&self, path: &str) -> Result<()> {
        let path = Path::new(path)
            .canonicalize()
            .map_err(|_| DesktopError::MissingFile(path.to_owned()))?;
        if self.allowed.lock()?.remove(&path) {
            Ok(())
        } else {
            Err(DesktopError::BadRequest(
                "fichier non ouvert par l'utilisateur".to_owned(),
            ))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn registers_files_and_authorizes_one_read() {
        let dir = tempfile::tempdir().unwrap();
        let book = dir.path().join("Livre v01.cbz");
        std::fs::write(&book, b"1234").unwrap();
        let other = dir.path().join("secret.txt");
        std::fs::write(&other, b"x").unwrap();

        let files = OpenedFiles::default();
        let added = files
            .register([
                book.clone(),
                dir.path().to_path_buf(),
                dir.path().join("absent"),
            ])
            .unwrap();
        assert_eq!(added, 1);

        let pending = files.take_pending().unwrap();
        assert_eq!(pending.len(), 1);
        assert_eq!(pending[0].name, "Livre v01.cbz");
        assert_eq!(pending[0].size_bytes, 4);
        assert_eq!(files.take_pending().unwrap(), Vec::new());

        assert_eq!(
            files.authorize(other.to_str().unwrap()).unwrap_err().code(),
            "invalid"
        );
        files.authorize(&pending[0].path).unwrap();
        assert!(
            files.authorize(&pending[0].path).is_err(),
            "une seule lecture"
        );
    }
}
