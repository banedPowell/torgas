//! Commandes Tauri : une par méthode de `CoreBridge` (`app/services/core/bridge.ts`).
//!
//! Toutes sont asynchrones et exécutent le travail (SQLite, disque, analyse) sur
//! un thread bloquant, pour ne jamais geler la fenêtre.

use std::sync::Arc;

use tauri::State;
use tauri::ipc::{InvokeBody, Request, Response};
use torgas_core::{Bookmark, Locator, ReadingDirection, ReadingStatus, Series, Work};

use crate::error::{DesktopError, Result};
use crate::files::OpenedFiles;
use crate::library::{Desktop, ImportResult};

/// En-tête portant le nom du fichier importé (encodé en pourcentage : les en-têtes sont ASCII).
pub const NAME_HEADER: &str = "x-torgas-name";

/// État partagé géré par Tauri.
pub type DesktopState<'a> = State<'a, Arc<Desktop>>;

/// Exécute `job` sur un thread bloquant avec l'état desktop.
async fn blocking<T, F>(state: &DesktopState<'_>, job: F) -> Result<T>
where
    T: Send + 'static,
    F: FnOnce(&Desktop) -> Result<T> + Send + 'static,
{
    let desktop = Arc::clone(state.inner());
    tauri::async_runtime::spawn_blocking(move || job(&desktop))
        .await
        .map_err(|err| DesktopError::Internal(err.to_string()))?
}

/// Décode le nom de fichier transmis en en-tête.
pub fn decode_name(raw: &str) -> Result<String> {
    crate::protocol::percent_decode(raw)
        .ok_or_else(|| DesktopError::BadRequest("nom de fichier mal encodé".to_owned()))
}

/// Importe un fichier. Les octets arrivent en corps binaire brut (pas de JSON),
/// le nom dans l'en-tête [`NAME_HEADER`].
#[tauri::command]
pub async fn import_file(request: Request<'_>, state: DesktopState<'_>) -> Result<ImportResult> {
    let name = request
        .headers()
        .get(NAME_HEADER)
        .and_then(|value| value.to_str().ok())
        .ok_or_else(|| DesktopError::BadRequest(format!("en-tête {NAME_HEADER} absent")))
        .and_then(decode_name)?;
    let InvokeBody::Raw(bytes) = request.body() else {
        return Err(DesktopError::BadRequest(
            "corps binaire attendu pour import_file".to_owned(),
        ));
    };
    let bytes = bytes.clone();
    blocking(
        &state,
        move |desktop| Ok(desktop.import_file(&name, &bytes)),
    )
    .await
}

/// Toutes les œuvres.
#[tauri::command]
pub async fn list_works(state: DesktopState<'_>) -> Result<Vec<Work>> {
    blocking(&state, Desktop::list_works).await
}

/// Une œuvre (ou `null`).
#[tauri::command]
pub async fn get_work(state: DesktopState<'_>, id: String) -> Result<Option<Work>> {
    blocking(&state, move |d| d.get_work(&id)).await
}

/// Toutes les séries.
#[tauri::command]
pub async fn list_series(state: DesktopState<'_>) -> Result<Vec<Series>> {
    blocking(&state, Desktop::list_series).await
}

/// Change le statut de lecture.
#[tauri::command]
pub async fn set_status(state: DesktopState<'_>, id: String, status: ReadingStatus) -> Result<()> {
    blocking(&state, move |d| d.set_status(&id, status)).await
}

/// Change le sens de lecture d'une série.
#[tauri::command]
pub async fn set_series_direction(
    state: DesktopState<'_>,
    series_id: String,
    direction: ReadingDirection,
) -> Result<()> {
    blocking(&state, move |d| {
        d.set_series_direction(&series_id, direction)
    })
    .await
}

/// Supprime des œuvres et leurs fichiers de la bibliothèque (identifiants inconnus ignorés).
#[tauri::command]
pub async fn delete_works(state: DesktopState<'_>, ids: Vec<String>) -> Result<()> {
    blocking(&state, move |d| d.delete_works(&ids)).await
}

/// Contenu du fichier d'une œuvre, en réponse binaire (`ArrayBuffer` côté JS).
#[tauri::command]
pub async fn get_book_bytes(state: DesktopState<'_>, id: String) -> Result<Response> {
    blocking(&state, move |d| d.book_bytes(&id).map(Response::new)).await
}

/// Nombre de pages d'une œuvre lue page par page (CBZ, manga EPUB fait d'images).
#[tauri::command]
pub async fn get_page_count(state: DesktopState<'_>, id: String) -> Result<usize> {
    blocking(&state, move |d| d.page_count(&id)).await
}

/// Chapitres contenus dans un volume (d'après le nom de ses pages).
#[tauri::command]
pub async fn get_volume_chapters(
    state: DesktopState<'_>,
    id: String,
) -> Result<Vec<torgas_core::contents::VolumeChapter>> {
    blocking(&state, move |d| d.volume_chapters(&id)).await
}

/// Dernière position de lecture.
#[tauri::command]
pub async fn get_locator(state: DesktopState<'_>, id: String) -> Result<Option<Locator>> {
    blocking(&state, move |d| d.get_locator(&id)).await
}

/// Enregistre la position de lecture.
#[tauri::command]
pub async fn save_locator(state: DesktopState<'_>, id: String, locator: Locator) -> Result<()> {
    blocking(&state, move |d| d.save_locator(&id, &locator)).await
}

/// Marque-pages d'une œuvre.
#[tauri::command]
pub async fn list_bookmarks(state: DesktopState<'_>, id: String) -> Result<Vec<Bookmark>> {
    blocking(&state, move |d| d.list_bookmarks(&id)).await
}

/// Ajoute un marque-page.
#[tauri::command]
pub async fn add_bookmark(
    state: DesktopState<'_>,
    id: String,
    locator: Locator,
    label: String,
) -> Result<Bookmark> {
    blocking(&state, move |d| d.add_bookmark(&id, &locator, &label)).await
}

/// Supprime un marque-page.
#[tauri::command]
pub async fn remove_bookmark(state: DesktopState<'_>, bookmark_id: String) -> Result<()> {
    blocking(&state, move |d| d.remove_bookmark(&bookmark_id)).await
}

/// Ouvre une session de lecture ; renvoie son identifiant.
#[tauri::command]
pub async fn start_session(state: DesktopState<'_>, work_id: String) -> Result<String> {
    blocking(&state, move |d| d.start_session(&work_id)).await
}

/// Clôt une session de lecture.
#[tauri::command]
pub async fn end_session(
    state: DesktopState<'_>,
    session_id: String,
    minutes: f64,
    progress: f64,
) -> Result<()> {
    blocking(&state, move |d| {
        d.end_session(&session_id, minutes, progress)
    })
    .await
}

/// Fichiers ouverts par le système (association, ligne de commande) ou déposés
/// sur la fenêtre, pas encore pris en charge par l'app.
// Tauri passe l'état par valeur.
#[allow(clippy::needless_pass_by_value)]
#[tauri::command]
pub fn take_opened_files(files: State<'_, OpenedFiles>) -> Result<Vec<crate::files::OpenedFile>> {
    files.take_pending()
}

/// Lit un fichier ouvert ou déposé (et seulement ceux-là), en réponse binaire.
#[tauri::command]
pub async fn read_opened_file(files: State<'_, OpenedFiles>, path: String) -> Result<Response> {
    files.authorize(&path)?;
    tauri::async_runtime::spawn_blocking(move || std::fs::read(&path))
        .await
        .map_err(|err| DesktopError::Internal(err.to_string()))?
        .map(Response::new)
        .map_err(DesktopError::from)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn decodes_percent_encoded_names() {
        assert_eq!(
            decode_name("L%27%C3%A9t%C3%A9%20v01.cbz").unwrap(),
            "L'été v01.cbz"
        );
        assert_eq!(decode_name("plain.epub").unwrap(), "plain.epub");
        assert_eq!(decode_name("bad%2").unwrap_err().code(), "invalid");
        assert_eq!(decode_name("bad%FF").unwrap_err().code(), "invalid");
    }
}
