//! Erreurs renvoyées à l'application par les commandes et le protocole.

use serde::ser::SerializeStruct;
use serde::{Serialize, Serializer};
use thiserror::Error;
use torgas_core::CoreError;

/// Résultat raccourci des opérations de la coquille desktop.
pub type Result<T, E = DesktopError> = std::result::Result<T, E>;

/// Erreur d'une commande ou d'une requête `torgas://`.
///
/// Sérialisée en `{ code, message }` : `code` est stable (l'app peut s'en servir),
/// `message` est lisible (français).
#[derive(Debug, Error)]
pub enum DesktopError {
    /// Erreur du cœur (analyse, archive, base…).
    #[error(transparent)]
    Core(#[from] CoreError),

    /// Erreur d'entrée/sortie sur le disque (bibliothèque, couvertures).
    #[error("erreur disque : {0}")]
    Io(#[from] std::io::Error),

    /// Fichier de l'œuvre absent de la bibliothèque sur le disque.
    #[error("fichier introuvable pour l'œuvre {0}")]
    MissingFile(String),

    /// Requête invalide (nom de fichier manquant, corps non binaire, URL inconnue…).
    #[error("requête invalide : {0}")]
    BadRequest(String),

    /// Une tâche de fond a échoué ou un verrou est empoisonné.
    #[error("erreur interne : {0}")]
    Internal(String),
}

impl DesktopError {
    /// Code stable exposé à l'application.
    pub fn code(&self) -> &'static str {
        match self {
            Self::Core(CoreError::NotFound { .. }) | Self::MissingFile(_) => "not_found",
            Self::Core(CoreError::InvalidValue(_) | CoreError::PageOutOfRange { .. })
            | Self::BadRequest(_) => "invalid",
            Self::Core(CoreError::Unsupported(_) | CoreError::Zip(_)) => "unsupported",
            Self::Core(_) => "core",
            Self::Io(_) => "io",
            Self::Internal(_) => "internal",
        }
    }
}

impl Serialize for DesktopError {
    fn serialize<S: Serializer>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error> {
        let mut state = serializer.serialize_struct("DesktopError", 2)?;
        state.serialize_field("code", self.code())?;
        state.serialize_field("message", &self.to_string())?;
        state.end()
    }
}

impl<T> From<std::sync::PoisonError<T>> for DesktopError {
    fn from(_: std::sync::PoisonError<T>) -> Self {
        Self::Internal("verrou empoisonné".to_owned())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn serializes_code_and_message() {
        let err = DesktopError::Core(CoreError::NotFound {
            kind: "œuvre",
            id: "42".to_owned(),
        });
        let json = serde_json::to_value(&err).unwrap();
        assert_eq!(json["code"], "not_found");
        assert_eq!(json["message"], "œuvre introuvable : 42");
    }
}
