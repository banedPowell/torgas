//! Modèle partagé avec l'application (contrat `CoreBridge`).
//!
//! Tous les types sont sérialisés en camelCase ; les énumérations en minuscules
//! (`snake_case`). Les fichiers TypeScript correspondants sont générés dans
//! `crates/torgas-core/bindings/` par le test `export_bindings`.

use std::fmt;
use std::str::FromStr;

use serde::{Deserialize, Serialize};

use crate::error::CoreError;

/// Progression à partir de laquelle une œuvre est « terminée » (le dernier écran
/// d'un EPUB n'atteint pas toujours 1). Le pendant TypeScript est
/// `FINISHED_THRESHOLD` dans `app/services/core/status.ts`.
pub const FINISHED_THRESHOLD: f64 = 0.995;

/// Déclare une énumération « chaîne » : sérialisation serde, `as_str`,
/// `Display` et `FromStr` alignés sur les valeurs stockées en base.
macro_rules! string_enum {
    (
        $(#[$meta:meta])*
        $name:ident { $($(#[$vmeta:meta])* $variant:ident => $value:literal),+ $(,)? }
    ) => {
        $(#[$meta])*
        #[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
        #[serde(rename_all = "snake_case")]
        #[cfg_attr(test, derive(ts_rs::TS), ts(rename_all = "snake_case"))]
        pub enum $name {
            $($(#[$vmeta])* $variant),+
        }

        impl $name {
            /// Valeur textuelle (identique à la sérialisation serde et à la base).
            pub const fn as_str(self) -> &'static str {
                match self {
                    $(Self::$variant => $value),+
                }
            }
        }

        impl fmt::Display for $name {
            fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
                f.write_str(self.as_str())
            }
        }

        impl FromStr for $name {
            type Err = CoreError;

            fn from_str(value: &str) -> Result<Self, Self::Err> {
                match value {
                    $($value => Ok(Self::$variant),)+
                    other => Err(CoreError::InvalidValue(format!(
                        concat!(stringify!($name), " inconnu : {}"),
                        other
                    ))),
                }
            }
        }
    };
}

string_enum! {
    /// Format de fichier pris en charge.
    Format {
        /// Livre numérique EPUB 2 ou 3.
        Epub => "epub",
        /// Archive d'images de bande dessinée.
        Cbz => "cbz",
    }
}

string_enum! {
    /// Nature d'une œuvre, qui choisit le lecteur.
    WorkKind {
        /// Texte (lecteur EPUB).
        Novel => "novel",
        /// Bande dessinée, manga, webtoon (lecteur d'images).
        Comic => "comic",
    }
}

string_enum! {
    /// Statut de lecture d'une œuvre dans la bibliothèque.
    ReadingStatus {
        /// À lire.
        ToRead => "to_read",
        /// En cours.
        Reading => "reading",
        /// Terminé.
        Finished => "finished",
        /// Abandonné.
        Abandoned => "abandoned",
        /// En pause.
        Paused => "paused",
    }
}

string_enum! {
    /// Sens de lecture d'une série.
    ReadingDirection {
        /// Gauche à droite (bande dessinée, comics).
        Ltr => "ltr",
        /// Droite à gauche (manga).
        Rtl => "rtl",
    }
}

impl Format {
    /// Nature d'œuvre par défaut pour ce format.
    pub const fn default_kind(self) -> WorkKind {
        match self {
            Self::Epub => WorkKind::Novel,
            Self::Cbz => WorkKind::Comic,
        }
    }
}

/// Une œuvre de la bibliothèque, telle que l'affiche l'application.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(test, derive(ts_rs::TS), ts(rename_all = "camelCase", optional_fields))]
pub struct Work {
    /// Identifiant (UUID v7).
    pub id: String,
    /// Titre.
    pub title: String,
    /// Auteurs, dans l'ordre.
    pub authors: Vec<String>,
    /// Nature (roman ou bande dessinée).
    pub kind: WorkKind,
    /// Langue (BCP 47).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub language: Option<String>,
    /// URL de la miniature de couverture (dépend de l'hôte : `torgas://`, Blob…).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cover_url: Option<String>,
    /// Série à laquelle appartient l'œuvre.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub series_id: Option<String>,
    /// Numéro de volume dans la série (pour un chapitre : le volume qui le contient, s'il est connu).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub volume: Option<f64>,
    /// Numéro de chapitre : présent si l'œuvre est un chapitre et non un volume entier.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub chapter: Option<f64>,
    /// Titre du chapitre, s'il est connu.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub chapter_title: Option<String>,
    /// Format du fichier.
    pub format: Format,
    /// Empreinte SHA-256 du fichier (hexadécimal).
    pub sha256: String,
    /// Taille du fichier en octets.
    #[cfg_attr(test, ts(type = "number"))]
    pub size_bytes: u64,
    /// Nombre de pages (CBZ uniquement).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub page_count: Option<u32>,
    /// Date d'ajout (ISO 8601).
    pub added_at: String,
    /// Statut de lecture.
    pub status: ReadingStatus,
    /// Progression globale, de 0 à 1.
    pub progress: f64,
    /// Date de dernière lecture (ISO 8601).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub last_read_at: Option<String>,
}

/// Une série (regroupement de volumes).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(test, derive(ts_rs::TS), ts(rename_all = "camelCase"))]
pub struct Series {
    /// Identifiant (UUID v7).
    pub id: String,
    /// Titre de la série.
    pub title: String,
    /// Sens de lecture.
    pub direction: ReadingDirection,
}

/// Position de lecture dans une œuvre.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(test, derive(ts_rs::TS), ts(rename_all = "camelCase", optional_fields))]
pub struct Locator {
    /// Format de l'œuvre (détermine le champ utilisé).
    pub format: Format,
    /// Position EPUB (EPUB CFI).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cfi: Option<String>,
    /// Page CBZ (à partir de 0).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub page: Option<u32>,
    /// Progression globale, de 0 à 1.
    pub progress: f64,
}

/// Marque-page.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(test, derive(ts_rs::TS), ts(rename_all = "camelCase"))]
pub struct Bookmark {
    /// Identifiant (UUID v7).
    pub id: String,
    /// Œuvre concernée.
    pub work_id: String,
    /// Position marquée.
    pub locator: Locator,
    /// Libellé libre (éventuellement vide).
    pub label: String,
    /// Date de création (ISO 8601).
    pub created_at: String,
}

/// Session de lecture (source de vérité du temps de lecture).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(test, derive(ts_rs::TS), ts(rename_all = "camelCase", optional_fields))]
pub struct ReadingSession {
    /// Identifiant (UUID v7).
    pub id: String,
    /// Œuvre lue ; absente si l'œuvre a été supprimée depuis (la session reste comptée).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub work_id: Option<String>,
    /// Début (ISO 8601).
    pub started_at: String,
    /// Fin (ISO 8601), absente tant que la session est ouverte.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ended_at: Option<String>,
    /// Minutes de lecture effective (pauses exclues).
    pub minutes: f64,
    /// Progression au début de la session.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub progress_start: Option<f64>,
    /// Progression à la fin de la session.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub progress_end: Option<f64>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn enums_round_trip() {
        for status in [
            ReadingStatus::ToRead,
            ReadingStatus::Reading,
            ReadingStatus::Finished,
            ReadingStatus::Abandoned,
            ReadingStatus::Paused,
        ] {
            assert_eq!(status.as_str().parse::<ReadingStatus>().unwrap(), status);
            assert_eq!(
                serde_json::to_string(&status).unwrap(),
                format!("\"{status}\"")
            );
        }
        assert_eq!(
            "rtl".parse::<ReadingDirection>().unwrap(),
            ReadingDirection::Rtl
        );
        assert!("pdf".parse::<Format>().is_err());
        assert_eq!(Format::Cbz.default_kind(), WorkKind::Comic);
        assert_eq!(Format::Epub.default_kind(), WorkKind::Novel);
    }

    #[test]
    fn locator_serializes_without_missing_fields() {
        let locator = Locator {
            format: Format::Cbz,
            cfi: None,
            page: Some(4),
            progress: 0.5,
        };
        let json = serde_json::to_string(&locator).unwrap();
        assert_eq!(json, r#"{"format":"cbz","page":4,"progress":0.5}"#);
        let back: Locator = serde_json::from_str(&json).unwrap();
        assert_eq!(back, locator);
    }

    #[test]
    fn work_uses_camel_case() {
        let work = Work {
            id: "w".into(),
            title: "T".into(),
            authors: vec!["A".into()],
            kind: WorkKind::Comic,
            language: None,
            cover_url: None,
            series_id: Some("s".into()),
            volume: Some(3.0),
            chapter: Some(12.5),
            chapter_title: None,
            format: Format::Cbz,
            sha256: "00".into(),
            size_bytes: 10,
            page_count: Some(12),
            added_at: "2026-01-01T00:00:00.000Z".into(),
            status: ReadingStatus::ToRead,
            progress: 0.0,
            last_read_at: None,
        };
        let value = serde_json::to_value(&work).unwrap();
        assert_eq!(value["seriesId"], "s");
        assert_eq!(value["sizeBytes"], 10);
        assert_eq!(value["pageCount"], 12);
        assert_eq!(value["chapter"], 12.5);
        assert!(value.get("chapterTitle").is_none());
        assert_eq!(value["status"], "to_read");
        assert!(value.get("coverUrl").is_none());
    }
}
