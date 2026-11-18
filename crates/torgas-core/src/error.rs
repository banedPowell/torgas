//! Erreurs typées du cœur.

use thiserror::Error;

/// Résultat raccourci utilisant [`CoreError`].
pub type Result<T, E = CoreError> = std::result::Result<T, E>;

/// Erreurs renvoyées par le cœur de Torgas.
#[derive(Debug, Error)]
#[non_exhaustive]
pub enum CoreError {
    /// Le fichier n'est ni un EPUB ni un CBZ exploitable.
    #[error("format non pris en charge : {0}")]
    Unsupported(String),

    /// L'archive ZIP est illisible ou corrompue.
    #[error("archive ZIP illisible : {0}")]
    Zip(#[from] zip::result::ZipError),

    /// Erreur d'entrée/sortie lors de la lecture d'une entrée d'archive.
    #[error("erreur de lecture : {0}")]
    Io(#[from] std::io::Error),

    /// Un document XML (container, OPF, encryption) est mal formé.
    #[error("XML invalide dans {file} : {message}")]
    Xml {
        /// Chemin du document dans l'archive.
        file: String,
        /// Message d'erreur du parseur.
        message: String,
    },

    /// L'EPUB ne respecte pas la structure attendue (container, OPF…).
    #[error("EPUB invalide : {0}")]
    InvalidEpub(String),

    /// L'image n'a pas pu être décodée ou encodée.
    #[error("image illisible : {0}")]
    Image(#[from] image::ImageError),

    /// Numéro de page hors de l'archive.
    #[error("page {index} inexistante (l'archive en compte {count})")]
    PageOutOfRange {
        /// Index demandé (à partir de 0).
        index: usize,
        /// Nombre de pages de l'archive.
        count: usize,
    },

    /// Élément introuvable dans la bibliothèque.
    #[error("{kind} introuvable : {id}")]
    NotFound {
        /// Type d'élément (œuvre, série, session…).
        kind: &'static str,
        /// Identifiant recherché.
        id: String,
    },

    /// Valeur invalide (statut inconnu, progression hors bornes…).
    #[error("valeur invalide : {0}")]
    InvalidValue(String),

    /// Erreur de la base SQLite.
    #[cfg(feature = "sqlite")]
    #[error("erreur SQLite : {0}")]
    Sqlite(#[from] rusqlite::Error),

    /// La base a été créée par une version plus récente de Torgas.
    #[cfg(feature = "sqlite")]
    #[error("schéma de base en version {found}, version {supported} au plus attendue")]
    SchemaTooNew {
        /// Version trouvée dans la base.
        found: u32,
        /// Version maximale gérée par ce binaire.
        supported: u32,
    },
}

impl CoreError {
    pub(crate) fn xml(file: &str, err: impl std::fmt::Display) -> Self {
        Self::Xml {
            file: file.to_owned(),
            message: err.to_string(),
        }
    }
}
