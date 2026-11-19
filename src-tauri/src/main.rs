//! Point d'entrée de l'application desktop Torgas.

// Pas de console supplémentaire sous Windows en release.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    torgas_desktop::run();
}
