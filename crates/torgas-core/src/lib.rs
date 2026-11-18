//! Cœur de Torgas.
//!
//! Ce crate est **pur** : il ne dépend ni de Tauri ni du navigateur et compile
//! aussi bien en natif qu'en `wasm32-unknown-unknown`. Il regroupe :
//!
//! - l'analyse des fichiers importés ([`analyze()`]) : format, empreinte, métadonnées ;
//! - la lecture des archives CBZ ([`cbz`]) et des métadonnées EPUB ([`epub`]) ;
//! - la déduction série/volume depuis un nom de fichier ([`naming`]) ;
//! - les miniatures de couverture ([`thumbnail`]) ;
//! - le modèle partagé avec l'application ([`model`]) et le schéma SQL ([`schema`]) ;
//! - derrière la feature `sqlite`, la bibliothèque SQLite native (`db`).

pub mod analysis;
pub mod cbz;
pub mod epub;
pub mod error;
pub mod hash;
pub mod model;
pub mod naming;
pub mod schema;
pub mod sort;
pub mod thumbnail;

mod xml;
mod zipread;

#[cfg(feature = "sqlite")]
pub mod db;

#[cfg(test)]
mod fixtures;

pub use analysis::{Analysis, analyze};
pub use cbz::{CbzArchive, Page};
pub use error::{CoreError, Result};
pub use model::{
    Bookmark, Format, Locator, ReadingDirection, ReadingSession, ReadingStatus, Series, Work,
    WorkKind,
};
pub use schema::{SCHEMA_SQL, SCHEMA_VERSION};

/// Génère les types TypeScript du contrat dans `crates/torgas-core/bindings/`.
#[cfg(test)]
mod bindings {
    use ts_rs::{Config, TS};

    use super::*;

    #[test]
    fn export_bindings() {
        let cfg = Config::new()
            .with_out_dir(concat!(env!("CARGO_MANIFEST_DIR"), "/bindings"))
            .with_large_int("number");
        Work::export_all(&cfg).unwrap();
        Series::export_all(&cfg).unwrap();
        Bookmark::export_all(&cfg).unwrap();
        ReadingSession::export_all(&cfg).unwrap();
        Analysis::export_all(&cfg).unwrap();
        #[cfg(feature = "sqlite")]
        db::ImportOutcome::export_all(&cfg).unwrap();
    }
}
