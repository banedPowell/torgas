//! Analyse d'un fichier à l'import.

use serde::{Deserialize, Serialize};

use crate::cbz::{CbzArchive, Page};
use crate::error::{CoreError, Result};
use crate::model::Format;
use crate::naming::{clean_stem, parse_volume};
use crate::{epub, hash, zipread};

/// Résultat de l'analyse d'un fichier, avant son insertion en bibliothèque.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(test, derive(ts_rs::TS), ts(rename_all = "camelCase", optional_fields))]
pub struct Analysis {
    /// Format détecté d'après le contenu.
    pub format: Format,
    /// Empreinte SHA-256 du fichier (hexadécimal), clé de dédoublonnage.
    pub sha256: String,
    /// Taille du fichier en octets.
    #[cfg_attr(test, ts(type = "number"))]
    pub size_bytes: u64,
    /// Titre (métadonnées EPUB, sinon nom du fichier).
    pub title: String,
    /// Auteurs (EPUB uniquement).
    pub authors: Vec<String>,
    /// Langue (EPUB uniquement).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub language: Option<String>,
    /// Série (métadonnées EPUB, sinon déduite du nom de fichier).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub series_title: Option<String>,
    /// Volume dans la série.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub volume: Option<f64>,
    /// Nombre de pages (CBZ uniquement).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub page_count: Option<u32>,
    /// Le fichier est protégé par une DRM (EPUB) : il ne pourra pas être lu.
    pub drm: bool,
    /// Couverture en taille réelle (à réduire avec [`crate::thumbnail::make`]).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cover: Option<Page>,
}

/// Analyse un fichier importé : détecte son format d'après le contenu (et non
/// l'extension), calcule son empreinte et extrait ses métadonnées.
///
/// - EPUB : métadonnées de l'OPF, couverture déclarée, détection de DRM ;
///   titre de repli et série éventuelle tirés du nom de fichier.
/// - CBZ (toute archive ZIP contenant des images) : titre, série et volume
///   déduits du nom, couverture = première page.
///
/// Renvoie [`CoreError::Unsupported`] pour tout autre contenu.
pub fn analyze(name: &str, bytes: &[u8]) -> Result<Analysis> {
    let mut archive = zipread::open(bytes)?;
    let sha256 = hash::sha256(bytes);
    let size_bytes = bytes.len() as u64;
    let stem = clean_stem(name);
    let from_name = parse_volume(name);

    if epub::is_epub(&mut archive)? {
        let meta = epub::read_metadata(&mut archive)?;
        let (series_title, volume) = match (meta.series_title, from_name) {
            (Some(series), _) => (Some(series), meta.volume),
            (None, Some((series, volume))) => (Some(series), Some(volume)),
            (None, None) => (None, None),
        };
        return Ok(Analysis {
            format: Format::Epub,
            sha256,
            size_bytes,
            title: meta.title.unwrap_or(stem),
            authors: meta.authors,
            language: meta.language,
            series_title,
            volume,
            page_count: None,
            drm: meta.drm,
            cover: meta.cover,
        });
    }

    drop(archive);
    let mut cbz = CbzArchive::open(bytes)?;
    if cbz.page_count() == 0 {
        return Err(CoreError::Unsupported(
            "archive ZIP sans EPUB ni images".to_owned(),
        ));
    }
    let page_count = u32::try_from(cbz.page_count()).unwrap_or(u32::MAX);
    let cover = cbz.page(0)?;
    let (series_title, volume) = from_name.map_or((None, None), |(series, volume)| {
        (Some(series), Some(volume))
    });
    Ok(Analysis {
        format: Format::Cbz,
        sha256,
        size_bytes,
        title: stem,
        authors: Vec::new(),
        language: None,
        series_title,
        volume,
        page_count: Some(page_count),
        drm: false,
        cover: Some(cover),
    })
}

#[cfg(test)]
#[allow(clippy::float_cmp)]
mod tests {
    use super::*;
    use crate::fixtures;

    #[test]
    fn analyzes_a_cbz() {
        let bytes = fixtures::cbz_p1_to_p12();
        let analysis = analyze("One_Piece v03.cbz", &bytes).unwrap();
        assert_eq!(analysis.format, Format::Cbz);
        assert_eq!(analysis.title, "One Piece v03");
        assert_eq!(analysis.series_title.as_deref(), Some("One Piece"));
        assert_eq!(analysis.volume, Some(3.0));
        assert_eq!(analysis.page_count, Some(12));
        assert_eq!(analysis.size_bytes, bytes.len() as u64);
        assert_eq!(analysis.sha256, hash::sha256(&bytes));
        assert_eq!(analysis.cover.unwrap().bytes, fixtures::jpeg_bytes(1));
        assert!(!analysis.drm);
    }

    #[test]
    fn detects_epub_by_content_not_extension() {
        let analysis = analyze("livre.zip", &fixtures::epub3()).unwrap();
        assert_eq!(analysis.format, Format::Epub);
        assert_eq!(analysis.title, "Les Misérables & co");
        assert_eq!(analysis.page_count, None);
        assert_eq!(analysis.volume, Some(1.5));
    }

    #[test]
    fn epub_without_series_uses_file_name() {
        let analysis = analyze("Saga - Tome 4.epub", &fixtures::epub_minimal()).unwrap();
        assert_eq!(analysis.title, "Saga");
        assert_eq!(analysis.series_title.as_deref(), Some("Saga"));
        assert_eq!(analysis.volume, Some(4.0));
        assert!(analysis.cover.is_none());
    }

    #[test]
    fn reports_drm() {
        let analysis = analyze("protégé.epub", &fixtures::epub_with_drm()).unwrap();
        assert!(analysis.drm);
    }

    #[test]
    fn rejects_unknown_content() {
        assert!(matches!(
            analyze("notes.cbz", &fixtures::zip_not_a_book()),
            Err(CoreError::Unsupported(_))
        ));
        assert!(matches!(
            analyze("texte.epub", b"hello"),
            Err(CoreError::Unsupported(_))
        ));
    }

    #[test]
    fn serializes_format_in_lowercase_camel_case() {
        let analysis = analyze("Titre #2.cbz", &fixtures::cbz_p1_to_p12()).unwrap();
        let value = serde_json::to_value(&analysis).unwrap();
        assert_eq!(value["format"], "cbz");
        assert_eq!(value["seriesTitle"], "Titre");
        assert_eq!(value["pageCount"], 12);
        assert_eq!(value["sizeBytes"], analysis.size_bytes);
        assert_eq!(value["cover"]["mime"], "image/jpeg");
        assert!(value.get("language").is_none());
    }
}
