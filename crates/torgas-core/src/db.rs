//! Bibliothèque SQLite native (feature `sqlite`), utilisée par la coquille Tauri.
//!
//! Le web utilise le même [`crate::schema::SCHEMA_SQL`] (et les mêmes migrations) via
//! wa-sqlite ; ce module n'est compilé qu'en natif.

use std::path::Path;
use std::str::FromStr;
use std::time::{SystemTime, UNIX_EPOCH};

use rusqlite::types::Type;
use rusqlite::{Connection, OptionalExtension, Row, TransactionBehavior, params};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::analysis::Analysis;
use crate::error::{CoreError, Result};
use crate::model::{
    Bookmark, FINISHED_THRESHOLD, Locator, ReadingDirection, ReadingSession, ReadingStatus, Series,
    Work,
};
use crate::naming::series_key;
use crate::schema::upgrade_sql;
#[cfg(test)]
use crate::schema::{SCHEMA_SQL, SCHEMA_VERSION};

/// Options d'insertion d'un fichier analysé.
#[derive(Debug, Clone, Default)]
pub struct ImportOptions {
    /// Emplacement local du fichier copié (chemin desktop, clé OPFS…).
    pub path: Option<String>,
    /// URL de la miniature de couverture, si l'hôte l'a déjà enregistrée.
    pub cover_url: Option<String>,
}

/// Résultat d'un import : nouvelle œuvre ou doublon (même SHA-256).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "status", rename_all = "snake_case")]
#[cfg_attr(test, derive(ts_rs::TS), ts(tag = "status", rename_all = "snake_case"))]
pub enum ImportOutcome {
    /// L'œuvre a été ajoutée à la bibliothèque.
    Imported {
        /// Œuvre créée.
        work: Work,
    },
    /// Le fichier était déjà présent : rien n'a été modifié.
    Duplicate {
        /// Œuvre existante.
        work: Work,
    },
}

impl ImportOutcome {
    /// Œuvre concernée, nouvelle ou existante.
    pub fn work(&self) -> &Work {
        match self {
            Self::Imported { work } | Self::Duplicate { work } => work,
        }
    }
}

/// Fichier d'une œuvre supprimée ([`Library::delete_works`]), à effacer par l'hôte.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RemovedFile {
    /// Œuvre supprimée.
    pub work_id: String,
    /// Empreinte du fichier (nom de la miniature de couverture chez les hôtes).
    pub sha256: String,
    /// Emplacement local du fichier, s'il avait été copié.
    pub path: Option<String>,
    /// URL de la miniature de couverture enregistrée pour l'œuvre.
    pub cover_url: Option<String>,
}

/// Liste d'identifiants passée en un seul paramètre, tableau JSON (`["a","b"]`).
const IDS_PARAM: &str = "(SELECT value FROM json_each(?1))";

/// Séries restées sans volume. Une série n'existe que par ses volumes (créée à l'import) :
/// le ménage est global. Le pendant TypeScript est `DELETE_EMPTY_SERIES` (`web/sql.ts`).
const DELETE_EMPTY_SERIES: &str =
    "DELETE FROM series WHERE NOT EXISTS (SELECT 1 FROM work WHERE work.series_id = series.id)";

/// Bibliothèque locale : une connexion SQLite au schéma appliqué.
pub struct Library {
    conn: Connection,
}

const WORK_SELECT: &str = "
    SELECT w.id, w.title, w.authors, w.kind, w.language, w.cover_url, w.series_id, w.volume,
           f.format, f.sha256, f.size_bytes, w.page_count,
           le.added_at, le.status, le.progress, le.last_read_at, w.chapter, w.chapter_title
    FROM work w
    JOIN library_entry le ON le.work_id = w.id
    JOIN file f ON f.id = (
        SELECT id FROM file WHERE work_id = w.id ORDER BY added_at, id LIMIT 1
    )";

impl Library {
    /// Ouvre (ou crée) la bibliothèque dans le fichier `path`.
    pub fn open(path: impl AsRef<Path>) -> Result<Self> {
        Self::from_connection(Connection::open(path)?)
    }

    /// Ouvre une bibliothèque en mémoire (tests, essais).
    pub fn open_in_memory() -> Result<Self> {
        Self::from_connection(Connection::open_in_memory()?)
    }

    /// Prend une connexion existante, active les clés étrangères, puis applique
    /// le schéma (base vide) ou les migrations manquantes, en une transaction.
    pub fn from_connection(mut conn: Connection) -> Result<Self> {
        conn.pragma_update(None, "foreign_keys", true)?;
        // Transaction immédiate : deux processus qui ouvrent la même base ne migrent
        // pas deux fois (la version est relue sous verrou).
        let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;
        let version: u32 = tx.pragma_query_value(None, "user_version", |row| row.get(0))?;
        if let Some(script) = upgrade_sql(version)? {
            tx.execute_batch(&script)?;
        }
        tx.commit()?;
        Ok(Self { conn })
    }

    /// Connexion sous-jacente (requêtes ad hoc, sauvegardes).
    pub fn connection(&self) -> &Connection {
        &self.conn
    }

    /// Insère un fichier analysé, avec sa série (créée si besoin, comparaison
    /// sans casse) et son entrée de bibliothèque (statut « à lire »).
    ///
    /// Si un fichier de même SHA-256 existe déjà, renvoie
    /// [`ImportOutcome::Duplicate`] sans rien modifier.
    pub fn import_analysis(
        &mut self,
        analysis: &Analysis,
        options: &ImportOptions,
    ) -> Result<ImportOutcome> {
        if let Some(work) = self.find_by_sha256(&analysis.sha256)? {
            return Ok(ImportOutcome::Duplicate { work });
        }
        let now = now();
        let work_id = new_id();
        let size = i64::try_from(analysis.size_bytes)
            .map_err(|_| CoreError::InvalidValue("taille de fichier trop grande".to_owned()))?;
        let authors = serde_json::to_string(&analysis.authors)
            .map_err(|err| CoreError::InvalidValue(err.to_string()))?;

        let tx = self.conn.transaction()?;
        let series_id = match analysis.series_title.as_deref().map(str::trim) {
            Some(title) if !title.is_empty() => {
                // Rapprochement par clé (casse, accents, ponctuation) : un EPUB « One Piece. »
                // rejoint la série « ONE PIECE » d'un CBZ. Les séries sont peu nombreuses.
                let key = series_key(title);
                let existing: Option<String> = {
                    let mut stmt = tx.prepare("SELECT id, title FROM series")?;
                    let rows = stmt.query_map([], |row| {
                        Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
                    })?;
                    let mut found = None;
                    for row in rows {
                        let (id, existing_title) = row?;
                        if series_key(&existing_title) == key {
                            found = Some(id);
                            break;
                        }
                    }
                    found
                };
                if let Some(id) = existing {
                    Some(id)
                } else {
                    let id = new_id();
                    tx.execute(
                        "INSERT INTO series (id, title, direction, created_at)
                         VALUES (?1, ?2, ?3, ?4)",
                        params![
                            id,
                            title,
                            analysis.direction.unwrap_or(ReadingDirection::Ltr).as_str(),
                            now
                        ],
                    )?;
                    Some(id)
                }
            }
            _ => None,
        };
        tx.execute(
            "INSERT INTO work (id, title, authors, kind, language, cover_url, series_id, volume,
                               page_count, created_at, chapter, chapter_title)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
            params![
                work_id,
                analysis.title,
                authors,
                analysis.kind.as_str(),
                analysis.language,
                options.cover_url,
                series_id,
                analysis.volume,
                analysis.page_count,
                now,
                analysis.chapter,
                analysis.chapter_title,
            ],
        )?;
        tx.execute(
            "INSERT INTO file (id, work_id, format, sha256, size_bytes, path, added_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![
                new_id(),
                work_id,
                analysis.format.as_str(),
                analysis.sha256,
                size,
                options.path,
                now,
            ],
        )?;
        tx.execute(
            "INSERT INTO library_entry (work_id, status, progress, added_at)
             VALUES (?1, ?2, 0, ?3)",
            params![work_id, ReadingStatus::ToRead.as_str(), now],
        )?;
        tx.commit()?;
        Ok(ImportOutcome::Imported {
            work: self.require_work(&work_id)?,
        })
    }

    /// Œuvre dont un fichier a l'empreinte `sha256`.
    pub fn find_by_sha256(&self, sha256: &str) -> Result<Option<Work>> {
        let work_id: Option<String> = self
            .conn
            .query_row(
                "SELECT work_id FROM file WHERE sha256 = ?1",
                [sha256],
                |row| row.get(0),
            )
            .optional()?;
        match work_id {
            Some(id) => self.get_work(&id),
            None => Ok(None),
        }
    }

    /// Toutes les œuvres, des plus récemment ajoutées aux plus anciennes.
    pub fn list_works(&self) -> Result<Vec<Work>> {
        self.query_works(
            &format!("{WORK_SELECT} ORDER BY le.added_at DESC, w.id DESC"),
            [],
        )
    }

    /// Une œuvre par son identifiant.
    pub fn get_work(&self, id: &str) -> Result<Option<Work>> {
        Ok(self
            .query_works(&format!("{WORK_SELECT} WHERE w.id = ?1"), [id])?
            .pop())
    }

    /// Emplacement local du fichier d'une œuvre.
    pub fn file_path(&self, work_id: &str) -> Result<Option<String>> {
        self.require_work(work_id)?;
        Ok(self.conn.query_row(
            "SELECT path FROM file WHERE work_id = ?1 ORDER BY added_at, id LIMIT 1",
            [work_id],
            |row| row.get(0),
        )?)
    }

    /// Change l'URL de la miniature de couverture.
    pub fn set_cover_url(&self, work_id: &str, cover_url: Option<&str>) -> Result<Work> {
        self.update_work(
            "UPDATE work SET cover_url = ?2 WHERE id = ?1",
            work_id,
            cover_url,
        )
    }

    /// Supprime des œuvres, en une transaction : la fiche, ses fichiers, son entrée de
    /// bibliothèque, sa position et ses marque-pages (clés étrangères `ON DELETE CASCADE`),
    /// puis les séries restées sans volume. Les sessions de lecture sont gardées, détachées
    /// de l'œuvre (`work_id` à NULL) : le temps de lecture reste acquis.
    ///
    /// Les identifiants inconnus sont ignorés (œuvre déjà supprimée ailleurs). Renvoie les
    /// fichiers des œuvres supprimées, que l'hôte efface du disque.
    pub fn delete_works<S: AsRef<str>>(&mut self, ids: &[S]) -> Result<Vec<RemovedFile>> {
        let ids = serde_json::to_string(&ids.iter().map(AsRef::as_ref).collect::<Vec<_>>())
            .map_err(|err| CoreError::InvalidValue(err.to_string()))?;
        let tx = self.conn.transaction()?;
        let files = {
            let mut stmt = tx.prepare(&format!(
                "SELECT f.work_id, f.sha256, f.path, w.cover_url FROM file f
                 JOIN work w ON w.id = f.work_id
                 WHERE f.work_id IN {IDS_PARAM} ORDER BY f.work_id, f.added_at, f.id"
            ))?;
            stmt.query_map([&ids], |row| {
                Ok(RemovedFile {
                    work_id: row.get(0)?,
                    sha256: row.get(1)?,
                    path: row.get(2)?,
                    cover_url: row.get(3)?,
                })
            })?
            .collect::<rusqlite::Result<Vec<_>>>()?
        };
        tx.execute(&format!("DELETE FROM work WHERE id IN {IDS_PARAM}"), [&ids])?;
        tx.execute(DELETE_EMPTY_SERIES, [])?;
        tx.commit()?;
        Ok(files)
    }

    /// Toutes les séries, par titre.
    pub fn list_series(&self) -> Result<Vec<Series>> {
        let mut stmt = self
            .conn
            .prepare("SELECT id, title, direction FROM series ORDER BY title COLLATE NOCASE")?;
        let rows = stmt.query_map([], series_from_row)?;
        Ok(rows.collect::<rusqlite::Result<_>>()?)
    }

    /// Une série par son identifiant.
    pub fn get_series(&self, id: &str) -> Result<Option<Series>> {
        Ok(self
            .conn
            .query_row(
                "SELECT id, title, direction FROM series WHERE id = ?1",
                [id],
                series_from_row,
            )
            .optional()?)
    }

    /// Volumes et chapitres d'une série, par volume puis chapitre croissants (sans numéro en
    /// dernier).
    pub fn series_works(&self, series_id: &str) -> Result<Vec<Work>> {
        self.query_works(
            &format!(
                "{WORK_SELECT} WHERE w.series_id = ?1
                 ORDER BY w.volume IS NULL, w.volume, w.chapter IS NOT NULL, w.chapter,
                          w.title COLLATE NOCASE"
            ),
            [series_id],
        )
    }

    /// Change le sens de lecture d'une série.
    pub fn set_series_direction(
        &self,
        series_id: &str,
        direction: ReadingDirection,
    ) -> Result<Series> {
        let changed = self.conn.execute(
            "UPDATE series SET direction = ?2 WHERE id = ?1",
            params![series_id, direction.as_str()],
        )?;
        if changed == 0 {
            return Err(not_found("série", series_id));
        }
        self.get_series(series_id)?
            .ok_or_else(|| not_found("série", series_id))
    }

    /// Change le statut de lecture ; renseigne les dates de début et de fin.
    pub fn set_status(&self, work_id: &str, status: ReadingStatus) -> Result<Work> {
        let now = now();
        let changed = self.conn.execute(
            "UPDATE library_entry SET
                status = ?2,
                started_at = CASE WHEN ?2 = 'reading' THEN COALESCE(started_at, ?3) ELSE started_at END,
                finished_at = CASE WHEN ?2 = 'finished' THEN ?3 ELSE finished_at END
             WHERE work_id = ?1",
            params![work_id, status.as_str(), now],
        )?;
        if changed == 0 {
            return Err(not_found("œuvre", work_id));
        }
        self.require_work(work_id)
    }

    /// Enregistre la position de lecture et met à jour la progression.
    ///
    /// Une progression positive passe l'œuvre « en cours » ; à partir de
    /// [`FINISHED_THRESHOLD`] (0,995, le dernier écran d'un EPUB n'atteint pas
    /// toujours 1) elle passe « terminée ». Une œuvre déjà terminée le reste en
    /// cas de relecture.
    pub fn save_locator(&mut self, work_id: &str, locator: &Locator) -> Result<Work> {
        check_fraction("progression", locator.progress)?;
        self.require_work(work_id)?;
        let now = now();
        let tx = self.conn.transaction()?;
        tx.execute(
            "INSERT INTO locator (work_id, format, cfi, page, progress, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)
             ON CONFLICT (work_id) DO UPDATE SET
                format = excluded.format, cfi = excluded.cfi, page = excluded.page,
                progress = excluded.progress, updated_at = excluded.updated_at",
            params![
                work_id,
                locator.format.as_str(),
                locator.cfi,
                locator.page,
                locator.progress,
                now
            ],
        )?;
        tx.execute(
            "UPDATE library_entry SET
                progress = ?2,
                last_read_at = ?3,
                status = CASE
                    WHEN ?2 >= ?4 THEN 'finished'
                    WHEN status = 'finished' THEN status
                    WHEN ?2 > 0 THEN 'reading'
                    ELSE status END,
                started_at = CASE WHEN ?2 > 0 THEN COALESCE(started_at, ?3) ELSE started_at END,
                finished_at = CASE
                    WHEN ?2 >= ?4 AND status <> 'finished' THEN ?3 ELSE finished_at END
             WHERE work_id = ?1",
            params![work_id, locator.progress, now, FINISHED_THRESHOLD],
        )?;
        tx.commit()?;
        self.require_work(work_id)
    }

    /// Dernière position de lecture d'une œuvre.
    pub fn get_locator(&self, work_id: &str) -> Result<Option<Locator>> {
        Ok(self
            .conn
            .query_row(
                "SELECT format, cfi, page, progress FROM locator WHERE work_id = ?1",
                [work_id],
                |row| locator_from_row(row, 0),
            )
            .optional()?)
    }

    /// Ajoute un marque-page.
    pub fn add_bookmark(&self, work_id: &str, locator: &Locator, label: &str) -> Result<Bookmark> {
        check_fraction("progression", locator.progress)?;
        self.require_work(work_id)?;
        let bookmark = Bookmark {
            id: new_id(),
            work_id: work_id.to_owned(),
            locator: locator.clone(),
            label: label.trim().to_owned(),
            created_at: now(),
        };
        self.conn.execute(
            "INSERT INTO bookmark (id, work_id, format, cfi, page, progress, label, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                bookmark.id,
                bookmark.work_id,
                locator.format.as_str(),
                locator.cfi,
                locator.page,
                locator.progress,
                bookmark.label,
                bookmark.created_at
            ],
        )?;
        Ok(bookmark)
    }

    /// Marque-pages d'une œuvre, par ordre de création.
    pub fn list_bookmarks(&self, work_id: &str) -> Result<Vec<Bookmark>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, work_id, label, created_at, format, cfi, page, progress
             FROM bookmark WHERE work_id = ?1 ORDER BY created_at, id",
        )?;
        let rows = stmt.query_map([work_id], |row| {
            Ok(Bookmark {
                id: row.get(0)?,
                work_id: row.get(1)?,
                label: row.get(2)?,
                created_at: row.get(3)?,
                locator: locator_from_row(row, 4)?,
            })
        })?;
        Ok(rows.collect::<rusqlite::Result<_>>()?)
    }

    /// Supprime un marque-page.
    pub fn remove_bookmark(&self, id: &str) -> Result<()> {
        if self
            .conn
            .execute("DELETE FROM bookmark WHERE id = ?1", [id])?
            == 0
        {
            return Err(not_found("marque-page", id));
        }
        Ok(())
    }

    /// Ouvre une session de lecture, en notant la progression de départ.
    pub fn start_session(&self, work_id: &str) -> Result<ReadingSession> {
        let work = self.require_work(work_id)?;
        let id = new_id();
        self.conn.execute(
            "INSERT INTO reading_session (id, work_id, started_at, minutes, progress_start)
             VALUES (?1, ?2, ?3, 0, ?4)",
            params![id, work_id, now(), work.progress],
        )?;
        self.require_session(&id)
    }

    /// Clôt une session avec ses minutes de lecture effective (pauses exclues,
    /// calculées par l'application) et la progression atteinte.
    pub fn end_session(
        &self,
        session_id: &str,
        minutes: f64,
        progress_end: Option<f64>,
    ) -> Result<ReadingSession> {
        if !minutes.is_finite() || minutes < 0.0 {
            return Err(CoreError::InvalidValue(format!(
                "minutes invalides : {minutes}"
            )));
        }
        if let Some(progress) = progress_end {
            check_fraction("progression", progress)?;
        }
        let changed = self.conn.execute(
            "UPDATE reading_session SET ended_at = ?2, minutes = ?3, progress_end = ?4
             WHERE id = ?1",
            params![session_id, now(), minutes, progress_end],
        )?;
        if changed == 0 {
            return Err(not_found("session", session_id));
        }
        self.require_session(session_id)
    }

    /// Sessions d'une œuvre, par date de début.
    pub fn list_sessions(&self, work_id: &str) -> Result<Vec<ReadingSession>> {
        let mut stmt = self.conn.prepare(&format!(
            "{SESSION_SELECT} WHERE work_id = ?1 ORDER BY started_at, id"
        ))?;
        let rows = stmt.query_map([work_id], session_from_row)?;
        Ok(rows.collect::<rusqlite::Result<_>>()?)
    }

    fn require_session(&self, id: &str) -> Result<ReadingSession> {
        self.conn
            .query_row(
                &format!("{SESSION_SELECT} WHERE id = ?1"),
                [id],
                session_from_row,
            )
            .optional()?
            .ok_or_else(|| not_found("session", id))
    }

    fn require_work(&self, id: &str) -> Result<Work> {
        self.get_work(id)?.ok_or_else(|| not_found("œuvre", id))
    }

    fn update_work(&self, sql: &str, work_id: &str, value: Option<&str>) -> Result<Work> {
        if self.conn.execute(sql, params![work_id, value])? == 0 {
            return Err(not_found("œuvre", work_id));
        }
        self.require_work(work_id)
    }

    fn query_works<P: rusqlite::Params>(&self, sql: &str, params: P) -> Result<Vec<Work>> {
        let mut stmt = self.conn.prepare(sql)?;
        let rows = stmt.query_map(params, work_from_row)?;
        Ok(rows.collect::<rusqlite::Result<_>>()?)
    }
}

const SESSION_SELECT: &str = "SELECT id, work_id, started_at, ended_at, minutes, progress_start,
    progress_end FROM reading_session";

fn not_found(kind: &'static str, id: &str) -> CoreError {
    CoreError::NotFound {
        kind,
        id: id.to_owned(),
    }
}

fn check_fraction(what: &str, value: f64) -> Result<()> {
    if (0.0..=1.0).contains(&value) {
        Ok(())
    } else {
        Err(CoreError::InvalidValue(format!(
            "{what} hors de [0, 1] : {value}"
        )))
    }
}

fn conversion_error(
    idx: usize,
    err: impl std::error::Error + Send + Sync + 'static,
) -> rusqlite::Error {
    rusqlite::Error::FromSqlConversionFailure(idx, Type::Text, Box::new(err))
}

fn parse_col<T: FromStr<Err = CoreError>>(row: &Row<'_>, idx: usize) -> rusqlite::Result<T> {
    let text: String = row.get(idx)?;
    text.parse().map_err(|err| conversion_error(idx, err))
}

fn work_from_row(row: &Row<'_>) -> rusqlite::Result<Work> {
    let authors: String = row.get(2)?;
    let size: i64 = row.get(10)?;
    Ok(Work {
        id: row.get(0)?,
        title: row.get(1)?,
        authors: serde_json::from_str(&authors).map_err(|err| conversion_error(2, err))?,
        kind: parse_col(row, 3)?,
        language: row.get(4)?,
        cover_url: row.get(5)?,
        series_id: row.get(6)?,
        volume: row.get(7)?,
        chapter: row.get(16)?,
        chapter_title: row.get(17)?,
        format: parse_col(row, 8)?,
        sha256: row.get(9)?,
        size_bytes: u64::try_from(size).map_err(|err| conversion_error(10, err))?,
        page_count: row.get(11)?,
        added_at: row.get(12)?,
        status: parse_col(row, 13)?,
        progress: row.get(14)?,
        last_read_at: row.get(15)?,
    })
}

fn series_from_row(row: &Row<'_>) -> rusqlite::Result<Series> {
    Ok(Series {
        id: row.get(0)?,
        title: row.get(1)?,
        direction: parse_col(row, 2)?,
    })
}

/// Lit un locator dans les colonnes `format, cfi, page, progress` à partir de `start`.
fn locator_from_row(row: &Row<'_>, start: usize) -> rusqlite::Result<Locator> {
    Ok(Locator {
        format: parse_col(row, start)?,
        cfi: row.get(start + 1)?,
        page: row.get(start + 2)?,
        progress: row.get(start + 3)?,
    })
}

fn session_from_row(row: &Row<'_>) -> rusqlite::Result<ReadingSession> {
    Ok(ReadingSession {
        id: row.get(0)?,
        work_id: row.get(1)?,
        started_at: row.get(2)?,
        ended_at: row.get(3)?,
        minutes: row.get(4)?,
        progress_start: row.get(5)?,
        progress_end: row.get(6)?,
    })
}

fn new_id() -> String {
    Uuid::now_v7().to_string()
}

fn now() -> String {
    let millis = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |elapsed| elapsed.as_millis());
    format_timestamp(u64::try_from(millis).unwrap_or(u64::MAX))
}

/// Formate un instant (millisecondes depuis l'époque Unix) en ISO 8601 UTC :
/// `2026-01-31T12:00:00.000Z`.
fn format_timestamp(millis: u64) -> String {
    let secs = millis / 1000;
    let days = secs / 86_400;
    let rem = secs % 86_400;
    let (year, month, day) = civil_from_days(days);
    format!(
        "{year:04}-{month:02}-{day:02}T{:02}:{:02}:{:02}.{:03}Z",
        rem / 3600,
        (rem % 3600) / 60,
        rem % 60,
        millis % 1000
    )
}

/// Convertit un nombre de jours depuis 1970-01-01 en date grégorienne
/// (algorithme `civil_from_days` de Howard Hinnant, dates positives).
fn civil_from_days(days: u64) -> (u64, u64, u64) {
    let z = days + 719_468;
    let era = z / 146_097;
    let doe = z % 146_097;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = doy - (153 * mp + 2) / 5 + 1;
    let month = if mp < 10 { mp + 3 } else { mp - 9 };
    let year = yoe + era * 400 + u64::from(month <= 2);
    (year, month, day)
}

#[cfg(test)]
#[allow(clippy::float_cmp)]
mod tests {
    use super::*;
    use crate::analysis::analyze;
    use crate::fixtures;
    use crate::model::{Format, WorkKind};

    fn library() -> Library {
        Library::open_in_memory().unwrap()
    }

    fn import(lib: &mut Library, name: &str, bytes: &[u8]) -> Work {
        let analysis = analyze(name, bytes).unwrap();
        match lib
            .import_analysis(
                &analysis,
                &ImportOptions {
                    path: Some(format!("/lib/{name}")),
                    cover_url: None,
                },
            )
            .unwrap()
        {
            ImportOutcome::Imported { work } => work,
            ImportOutcome::Duplicate { .. } => panic!("doublon inattendu"),
        }
    }

    fn cbz_locator(page: u32, progress: f64) -> Locator {
        Locator {
            format: Format::Cbz,
            cfi: None,
            page: Some(page),
            progress,
        }
    }

    #[test]
    fn timestamps_are_iso8601() {
        assert_eq!(format_timestamp(0), "1970-01-01T00:00:00.000Z");
        assert_eq!(
            format_timestamp(951_782_400_123),
            "2000-02-29T00:00:00.123Z"
        );
        assert_eq!(
            format_timestamp(1_795_000_000_000),
            "2026-11-18T11:06:40.000Z"
        );
        assert_eq!(now().len(), 24);
    }

    #[test]
    fn applies_schema_once_and_rejects_newer() {
        let lib = library();
        let version: u32 = lib
            .connection()
            .pragma_query_value(None, "user_version", |row| row.get(0))
            .unwrap();
        assert_eq!(version, SCHEMA_VERSION);
        let conn = lib.conn;
        let lib = Library::from_connection(conn).unwrap();
        lib.connection()
            .pragma_update(None, "user_version", SCHEMA_VERSION + 1)
            .unwrap();
        assert!(matches!(
            Library::from_connection(lib.conn),
            Err(CoreError::SchemaTooNew { .. })
        ));
    }

    #[test]
    fn imports_and_deduplicates_by_sha256() {
        let mut lib = library();
        let bytes = fixtures::cbz_p1_to_p12();
        let work = import(&mut lib, "Berserk T01.cbz", &bytes);
        assert_eq!(work.kind, WorkKind::Comic);
        assert_eq!(work.format, Format::Cbz);
        assert_eq!(work.page_count, Some(12));
        assert_eq!(work.status, ReadingStatus::ToRead);
        assert_eq!(work.volume, Some(1.0));
        assert_eq!(work.progress, 0.0);
        assert_eq!(Uuid::parse_str(&work.id).unwrap().get_version_num(), 7);

        let analysis = analyze("copie.cbz", &bytes).unwrap();
        let outcome = lib
            .import_analysis(&analysis, &ImportOptions::default())
            .unwrap();
        assert_eq!(outcome, ImportOutcome::Duplicate { work: work.clone() });
        assert_eq!(lib.list_works().unwrap().len(), 1);
        assert_eq!(
            lib.find_by_sha256(&work.sha256).unwrap(),
            Some(work.clone())
        );
        assert_eq!(
            lib.file_path(&work.id).unwrap().as_deref(),
            Some("/lib/Berserk T01.cbz")
        );
    }

    #[test]
    fn groups_volumes_into_series() {
        let mut lib = library();
        let epub = import(&mut lib, "monte-cristo.epub", &fixtures::epub2());
        assert_eq!(epub.kind, WorkKind::Novel);
        assert_eq!(epub.authors, ["Alexandre Dumas", "Auguste Maquet"]);
        assert_eq!(epub.language.as_deref(), Some("fr"));

        let v2 = import(&mut lib, "Saga v02.cbz", &fixtures::cbz_p1_to_p12());
        let v1 = import(&mut lib, "saga v01.cbz", &fixtures::cbz_with_folders());
        assert_eq!(v1.series_id, v2.series_id);
        let series_id = v1.series_id.clone().unwrap();

        let series = lib.list_series().unwrap();
        assert_eq!(series.len(), 2);
        let saga = lib.get_series(&series_id).unwrap().unwrap();
        assert_eq!(saga.title, "Saga");
        assert_eq!(saga.direction, ReadingDirection::Ltr);

        let volumes: Vec<_> = lib
            .series_works(&series_id)
            .unwrap()
            .into_iter()
            .map(|w| w.volume)
            .collect();
        assert_eq!(volumes, [Some(1.0), Some(2.0)]);

        let rtl = lib
            .set_series_direction(&series_id, ReadingDirection::Rtl)
            .unwrap();
        assert_eq!(rtl.direction, ReadingDirection::Rtl);
        assert!(matches!(
            lib.set_series_direction("absente", ReadingDirection::Rtl),
            Err(CoreError::NotFound { .. })
        ));

        let listed = lib.list_works().unwrap();
        assert_eq!(listed.len(), 3);
        assert_eq!(listed[0].id, v1.id, "le plus récent d'abord");
    }

    #[test]
    fn status_and_locator_update_progress() {
        let mut lib = library();
        let work = import(&mut lib, "Titre 001.cbz", &fixtures::cbz_p1_to_p12());
        assert_eq!(lib.get_locator(&work.id).unwrap(), None);

        let reading = lib.save_locator(&work.id, &cbz_locator(5, 0.5)).unwrap();
        assert_eq!(reading.status, ReadingStatus::Reading);
        assert_eq!(reading.progress, 0.5);
        assert!(reading.last_read_at.is_some());
        assert_eq!(
            lib.get_locator(&work.id).unwrap(),
            Some(cbz_locator(5, 0.5))
        );

        let done = lib.save_locator(&work.id, &cbz_locator(11, 1.0)).unwrap();
        assert_eq!(done.status, ReadingStatus::Finished);

        let reread = lib.save_locator(&work.id, &cbz_locator(0, 0.1)).unwrap();
        assert_eq!(reread.status, ReadingStatus::Finished);

        let paused = lib.set_status(&work.id, ReadingStatus::Paused).unwrap();
        assert_eq!(paused.status, ReadingStatus::Paused);

        assert!(matches!(
            lib.save_locator(&work.id, &cbz_locator(0, 1.5)),
            Err(CoreError::InvalidValue(_))
        ));
        assert!(matches!(
            lib.set_status("absente", ReadingStatus::Reading),
            Err(CoreError::NotFound { .. })
        ));
    }

    #[test]
    fn bookmarks() {
        let mut lib = library();
        let work = import(&mut lib, "livre.epub", &fixtures::epub3());
        let locator = Locator {
            format: Format::Epub,
            cfi: Some("epubcfi(/6/4!/4/2/1:0)".to_owned()),
            page: None,
            progress: 0.25,
        };
        let bookmark = lib
            .add_bookmark(&work.id, &locator, "  Chapitre 2 ")
            .unwrap();
        assert_eq!(bookmark.label, "Chapitre 2");
        let second = lib.add_bookmark(&work.id, &locator, "").unwrap();
        assert_eq!(
            lib.list_bookmarks(&work.id).unwrap(),
            [bookmark.clone(), second]
        );
        lib.remove_bookmark(&bookmark.id).unwrap();
        assert_eq!(lib.list_bookmarks(&work.id).unwrap().len(), 1);
        assert!(lib.remove_bookmark(&bookmark.id).is_err());
        assert!(lib.add_bookmark("absente", &locator, "x").is_err());
    }

    #[test]
    fn reading_sessions() {
        let mut lib = library();
        let work = import(&mut lib, "livre.epub", &fixtures::epub_minimal());
        let session = lib.start_session(&work.id).unwrap();
        assert_eq!(session.progress_start, Some(0.0));
        assert_eq!(session.ended_at, None);

        let ended = lib.end_session(&session.id, 12.5, Some(0.3)).unwrap();
        assert_eq!(ended.minutes, 12.5);
        assert_eq!(ended.progress_end, Some(0.3));
        assert!(ended.ended_at.is_some());
        assert_eq!(lib.list_sessions(&work.id).unwrap(), [ended]);

        assert!(lib.end_session(&session.id, -1.0, None).is_err());
        assert!(lib.end_session("absente", 1.0, None).is_err());
    }

    fn count(lib: &Library, table: &str) -> i64 {
        lib.connection()
            .query_row(&format!("SELECT count(*) FROM {table}"), [], |row| {
                row.get(0)
            })
            .unwrap()
    }

    #[test]
    fn delete_cascades_and_keeps_reading_sessions() {
        let mut lib = library();
        let work = import(&mut lib, "Vol 1.cbz", &fixtures::cbz_p1_to_p12());
        let other = import(&mut lib, "livre.epub", &fixtures::epub3());
        let updated = lib
            .set_cover_url(&work.id, Some("torgas://cover/abc"))
            .unwrap();
        assert_eq!(updated.cover_url.as_deref(), Some("torgas://cover/abc"));

        lib.save_locator(&work.id, &cbz_locator(1, 0.2)).unwrap();
        lib.add_bookmark(&work.id, &cbz_locator(1, 0.2), "")
            .unwrap();
        let session = lib.start_session(&work.id).unwrap();
        lib.end_session(&session.id, 7.5, Some(0.2)).unwrap();
        lib.start_session(&other.id).unwrap();

        let removed = lib.delete_works(&[work.id.as_str(), "inconnue"]).unwrap();
        assert_eq!(
            removed,
            [RemovedFile {
                work_id: work.id.clone(),
                sha256: work.sha256.clone(),
                path: Some("/lib/Vol 1.cbz".to_owned()),
                cover_url: Some("torgas://cover/abc".to_owned()),
            }]
        );
        assert_eq!(lib.get_work(&work.id).unwrap(), None);
        assert_eq!(lib.get_locator(&work.id).unwrap(), None);
        assert_eq!(lib.list_bookmarks(&work.id).unwrap(), []);
        assert_eq!(count(&lib, "file"), 1);
        assert_eq!(count(&lib, "library_entry"), 1);

        // Le temps de lecture reste acquis : la session est détachée, pas effacée.
        let kept: (Option<String>, f64) = lib
            .connection()
            .query_row(
                "SELECT work_id, minutes FROM reading_session WHERE id = ?1",
                [&session.id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .unwrap();
        assert_eq!(kept, (None, 7.5));
        assert_eq!(count(&lib, "reading_session"), 2);
        assert_eq!(
            lib.list_works().unwrap(),
            [lib.get_work(&other.id).unwrap().unwrap()]
        );

        // Déjà supprimée : rien à faire, pas d'erreur.
        assert_eq!(lib.delete_works(&[work.id]).unwrap(), []);
        assert_eq!(lib.delete_works::<&str>(&[]).unwrap(), []);
    }

    #[test]
    fn delete_removes_series_left_without_volumes() {
        let mut lib = library();
        let v1 = import(&mut lib, "Saga v01.cbz", &fixtures::cbz_p1_to_p12());
        let v2 = import(&mut lib, "Saga v02.cbz", &fixtures::cbz_with_folders());
        let series_id = v1.series_id.clone().unwrap();

        lib.delete_works(&[&v1.id]).unwrap();
        assert!(lib.get_series(&series_id).unwrap().is_some(), "reste le v2");

        lib.delete_works(&[&v2.id]).unwrap();
        assert_eq!(lib.get_series(&series_id).unwrap(), None);
        assert_eq!(lib.list_series().unwrap(), []);

        // Le réimport recrée l'œuvre (pas de doublon) et sa série.
        let again = import(&mut lib, "Saga v01.cbz", &fixtures::cbz_p1_to_p12());
        assert_ne!(again.id, v1.id);
        assert_eq!(lib.list_series().unwrap().len(), 1);
    }

    #[test]
    fn deletes_several_works_at_once() {
        let mut lib = library();
        let a = import(&mut lib, "a.epub", &fixtures::epub_minimal());
        let b = import(&mut lib, "b.epub", &fixtures::epub2());
        let c = import(&mut lib, "c.epub", &fixtures::epub3());
        let removed = lib.delete_works(&[&a.id, &c.id]).unwrap();
        let mut ids: Vec<_> = removed.into_iter().map(|f| f.work_id).collect();
        ids.sort();
        let mut expected = vec![a.id, c.id];
        expected.sort();
        assert_eq!(ids, expected);
        assert_eq!(lib.list_works().unwrap(), [b]);
    }

    /// Schéma en version 2 (avant les chapitres), tiré du schéma courant.
    fn schema_v2() -> String {
        let mut sql = SCHEMA_SQL.to_owned();
        let start = sql.find(",\n    -- Œuvre qui est un chapitre").unwrap();
        let end = sql.find("chapter_title TEXT\n").unwrap() + "chapter_title TEXT".len();
        sql.replace_range(start..end, "");
        let sql = sql
            .replace(
                "CREATE INDEX IF NOT EXISTS work_series_chapter_idx ON work (series_id, chapter);\n",
                "",
            )
            .replace("PRAGMA user_version = 3;", "PRAGMA user_version = 2;");
        assert!(!sql.contains("chapter"));
        sql
    }

    /// Base créée avec un ancien schéma ; une œuvre (volume 3 de « Saga ») y est insérée
    /// avec les colonnes de l'époque. Renvoie la connexion et l'identifiant de l'œuvre.
    fn legacy_library(schema: &str) -> (Connection, String) {
        let conn = Connection::open_in_memory().unwrap();
        conn.pragma_update(None, "foreign_keys", true).unwrap();
        conn.execute_batch(schema).unwrap();
        let at = "2026-01-01T00:00:00.000Z";
        conn.execute_batch(&format!(
            "INSERT INTO series (id, title, direction, created_at) VALUES ('s', 'Saga', 'ltr', '{at}');
             INSERT INTO work (id, title, authors, kind, series_id, volume, page_count, created_at)
               VALUES ('w', 'Saga v03', '[]', 'comic', 's', 3, 12, '{at}');
             INSERT INTO file (id, work_id, format, sha256, size_bytes, path, added_at)
               VALUES ('f', 'w', 'cbz', '{}', 10, NULL, '{at}');
             INSERT INTO library_entry (work_id, status, progress, added_at)
               VALUES ('w', 'to_read', 0, '{at}');
             INSERT INTO reading_session (id, work_id, started_at, minutes)
               VALUES ('r', 'w', '{at}', 0);",
            "0".repeat(64)
        ))
        .unwrap();
        (conn, "w".to_owned())
    }

    fn user_version(lib: &Library) -> u32 {
        lib.connection()
            .pragma_query_value(None, "user_version", |row| row.get(0))
            .unwrap()
    }

    #[test]
    fn migrates_v1_keeping_reading_sessions() {
        // Base en version 1 : `reading_session.work_id` en `NOT NULL … ON DELETE CASCADE`.
        let v2_fk = "work_id         TEXT REFERENCES work (id) ON DELETE SET NULL,";
        let v2 = schema_v2();
        assert_eq!(v2.matches(v2_fk).count(), 1);
        let v1_sql = v2
            .replace(
                v2_fk,
                "work_id         TEXT NOT NULL REFERENCES work (id) ON DELETE CASCADE,",
            )
            .replace("PRAGMA user_version = 2;", "PRAGMA user_version = 1;");
        let (conn, work_id) = legacy_library(&v1_sql);

        let mut lib = Library::from_connection(conn).unwrap();
        assert_eq!(user_version(&lib), SCHEMA_VERSION);
        assert_eq!(lib.list_sessions(&work_id).unwrap().len(), 1);

        lib.delete_works(&[&work_id]).unwrap();
        assert_eq!(count(&lib, "reading_session"), 1);
        let ended = lib.end_session("r", 3.0, Some(0.1)).unwrap();
        assert_eq!(ended.work_id, None);
    }

    #[test]
    fn migrates_v2_adding_chapters() {
        let (conn, work_id) = legacy_library(&schema_v2());
        let mut lib = Library::from_connection(conn).unwrap();
        assert_eq!(user_version(&lib), SCHEMA_VERSION);

        let volume = lib.get_work(&work_id).unwrap().unwrap();
        assert_eq!(volume.volume, Some(3.0));
        assert_eq!(volume.chapter, None);
        assert_eq!(volume.chapter_title, None);

        let chapter = import(
            &mut lib,
            "Saga v04 c031 - La suite.cbz",
            &fixtures::cbz_p1_to_p12(),
        );
        assert_eq!(chapter.series_id.as_deref(), Some("s"));
        assert_eq!(chapter.volume, Some(4.0));
        assert_eq!(chapter.chapter, Some(31.0));
        assert_eq!(chapter.chapter_title.as_deref(), Some("La suite"));
        let index: i64 = lib
            .connection()
            .query_row(
                "SELECT count(*) FROM sqlite_master WHERE name = 'work_series_chapter_idx'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(index, 1);
    }

    #[test]
    fn manga_epub_joins_the_cbz_series() {
        let mut lib = library();
        let epub = fixtures::epub_comic(
            r##"<dc:title>Saga, tome 2</dc:title><dc:subject>Manga</dc:subject>
               <meta property="rendition:layout">pre-paginated</meta>
               <meta property="belongs-to-collection" id="c">SAGA</meta>
               <meta refines="#c" property="group-position">2</meta>"##,
            r#"page-progression-direction="rtl""#,
            true,
        );
        let v2 = import(&mut lib, "saga-2.epub", &epub);
        assert_eq!(v2.kind, WorkKind::Comic);
        assert_eq!(v2.format, Format::Epub);
        assert_eq!(v2.volume, Some(2.0));
        let series_id = v2.series_id.clone().unwrap();
        // Série créée par le manga EPUB : droite → gauche, comme son spine.
        assert_eq!(
            lib.get_series(&series_id).unwrap().unwrap().direction,
            ReadingDirection::Rtl
        );

        let v1 = import(&mut lib, "Saga_v01.cbz", &fixtures::cbz_p1_to_p12());
        assert_eq!(v1.series_id.as_deref(), Some(series_id.as_str()));
        let ids: Vec<_> = lib
            .series_works(&series_id)
            .unwrap()
            .into_iter()
            .map(|w| w.id)
            .collect();
        assert_eq!(ids, [v1.id, v2.id]);
        assert_eq!(lib.list_series().unwrap().len(), 1);
    }

    #[test]
    fn one_piece_cbz_and_kindle_epub_share_a_series() {
        let mut lib = library();
        let v13 = import(&mut lib, fixtures::ANNA_CBZ_NAME, &fixtures::cbz_scan());
        let v67 = import(
            &mut lib,
            fixtures::ANNA_EPUB_NAME,
            &fixtures::epub_kindle_manga(),
        );
        assert_eq!((v13.kind, v67.kind), (WorkKind::Comic, WorkKind::Comic));
        assert_eq!((v13.volume, v67.volume), (Some(13.0), Some(67.0)));
        assert_eq!(v13.series_id, v67.series_id);
        let series = lib.list_series().unwrap();
        assert_eq!(series.len(), 1);
        assert_eq!(series[0].title, "One Piece");

        // Casse, accents et ponctuation finale n'y changent rien.
        let other = import(&mut lib, "ONE PIECE. v02.cbz", &fixtures::cbz_p1_to_p12());
        assert_eq!(other.series_id, v13.series_id);
        assert_eq!(lib.list_series().unwrap().len(), 1);
    }

    #[test]
    fn series_lists_volumes_and_chapters() {
        let mut lib = library();
        let c2 = import(
            &mut lib,
            "Saga - Chapitre 2.cbz",
            &fixtures::cbz_p1_to_p12(),
        );
        let v1 = import(&mut lib, "Saga v01.cbz", &fixtures::cbz_with_folders());
        let c1 = import(
            &mut lib,
            "Saga #1.cbz",
            &fixtures::cbz_with_comic_info("<ComicInfo><Title>Début</Title></ComicInfo>"),
        );
        assert_eq!(c1.chapter_title.as_deref(), Some("Début"));
        assert_eq!(c1.series_id, v1.series_id);
        assert_eq!(c2.series_id, v1.series_id);
        let ids: Vec<_> = lib
            .series_works(v1.series_id.as_deref().unwrap())
            .unwrap()
            .into_iter()
            .map(|w| w.id)
            .collect();
        assert_eq!(ids, [v1.id, c1.id, c2.id]);
    }

    #[test]
    fn import_outcome_is_tagged() {
        let mut lib = library();
        let work = import(&mut lib, "a.epub", &fixtures::epub_minimal());
        let json = serde_json::to_value(ImportOutcome::Duplicate { work }).unwrap();
        assert_eq!(json["status"], "duplicate");
        assert_eq!(json["work"]["kind"], "novel");
    }
}
