//! Coquille desktop Tauri 2 de Torgas.
//!
//! Adaptateur mince autour de `torgas-core` (voir ADR 0003 et 0005) :
//!
//! - [`commands`] : une commande par méthode de `CoreBridge` ;
//! - [`protocol`] : `torgas://` sert les pages CBZ et les couvertures ;
//! - [`library`] : bibliothèque sur disque (`~/Torgas/`) et base SQLite ;
//! - [`files`] : fichiers déposés sur la fenêtre ou ouverts par association.

pub mod commands;
pub mod error;
pub mod files;
pub mod library;
pub mod protocol;
pub mod storage;

#[cfg(test)]
mod test_fixtures;

use std::path::{Path, PathBuf};
use std::sync::Arc;

use tauri::{AppHandle, DragDropEvent, Emitter, Manager, WindowEvent};

use crate::files::{OPENED_FILES_EVENT, OpenedFiles};
use crate::library::Desktop;

/// Variable d'environnement qui remplace `~/Torgas` (essais, tests manuels).
pub const LIBRARY_DIR_ENV: &str = "TORGAS_LIBRARY_DIR";
/// Variable d'environnement qui remplace le dossier de données de l'app.
pub const DATA_DIR_ENV: &str = "TORGAS_DATA_DIR";

fn env_dir(name: &str) -> Option<PathBuf> {
    std::env::var_os(name)
        .filter(|value| !value.is_empty())
        .map(PathBuf::from)
}

fn open_desktop(app: &AppHandle) -> Result<Desktop, Box<dyn std::error::Error>> {
    let library_dir = match env_dir(LIBRARY_DIR_ENV) {
        Some(dir) => dir,
        None => app.path().home_dir()?.join("Torgas"),
    };
    let data_dir = match env_dir(DATA_DIR_ENV) {
        Some(dir) => dir,
        None => app.path().app_data_dir()?,
    };
    Ok(Desktop::open(library_dir, &data_dir)?)
}

/// Met en attente des fichiers venus du système et prévient l'app.
fn open_files<P: AsRef<Path>>(app: &AppHandle, paths: impl IntoIterator<Item = P>) {
    let files = app.state::<OpenedFiles>();
    if matches!(files.register(paths), Ok(n) if n > 0) {
        let _ = app.emit(OPENED_FILES_EVENT, ());
    }
}

/// Démarre l'application desktop.
pub fn run() {
    let app = tauri::Builder::default()
        .manage(OpenedFiles::default())
        .setup(|app| {
            let desktop = open_desktop(app.handle())?;
            app.manage(Arc::new(desktop));
            // Windows et Linux : les fichiers ouverts par association arrivent en arguments.
            open_files(app.handle(), std::env::args_os().skip(1).map(PathBuf::from));
            Ok(())
        })
        .register_asynchronous_uri_scheme_protocol(protocol::SCHEME, |ctx, request, responder| {
            let app = ctx.app_handle().clone();
            tauri::async_runtime::spawn_blocking(move || {
                let desktop = app.state::<Arc<Desktop>>();
                let path = request.uri().path().to_owned();
                responder.respond(protocol::respond(&desktop, request.method(), &path));
            });
        })
        .on_window_event(|window, event| {
            if let WindowEvent::DragDrop(DragDropEvent::Drop { paths, .. }) = event {
                open_files(window.app_handle(), paths);
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::import_file,
            commands::list_works,
            commands::get_work,
            commands::list_series,
            commands::set_status,
            commands::set_series_direction,
            commands::delete_works,
            commands::get_book_bytes,
            commands::get_page_count,
            commands::get_locator,
            commands::save_locator,
            commands::list_bookmarks,
            commands::add_bookmark,
            commands::remove_bookmark,
            commands::start_session,
            commands::end_session,
            commands::take_opened_files,
            commands::read_opened_file,
        ])
        .build(tauri::generate_context!());

    match app {
        Ok(app) => app.run(|app, event| {
            // macOS : les fichiers ouverts par association arrivent en événement.
            #[cfg(target_os = "macos")]
            if let tauri::RunEvent::Opened { urls } = &event {
                open_files(app, urls.iter().filter_map(|url| url.to_file_path().ok()));
            }
            let _ = (app, event);
        }),
        Err(err) => {
            eprintln!("Torgas : impossible de démarrer l'application : {err}");
            std::process::exit(1);
        }
    }
}
