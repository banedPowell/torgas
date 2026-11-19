//! Analyse d'un fichier à l'import.

use serde::{Deserialize, Serialize};

use crate::cbz::{CbzArchive, Page};
use crate::comicinfo::ComicInfo;
use crate::error::{CoreError, Result};
use crate::model::{Format, ReadingDirection, WorkKind};
use crate::naming::{NameInfo, author_from_name, clean_stem, normalize_series_title, parse_name};
use crate::{epub, hash, zipread};

/// Résultat de l'analyse d'un fichier, avant son insertion en bibliothèque.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(test, derive(ts_rs::TS), ts(rename_all = "camelCase", optional_fields))]
pub struct Analysis {
    /// Format détecté d'après le contenu.
    pub format: Format,
    /// Nature de l'œuvre : un CBZ, ou un EPUB reconnu comme manga/BD, est une bande dessinée.
    pub kind: WorkKind,
    /// Empreinte SHA-256 du fichier (hexadécimal), clé de dédoublonnage.
    pub sha256: String,
    /// Taille du fichier en octets.
    #[cfg_attr(test, ts(type = "number"))]
    pub size_bytes: u64,
    /// Titre (métadonnées EPUB, sinon nom du fichier).
    pub title: String,
    /// Auteurs (EPUB, ou `Writer` de `ComicInfo.xml` pour un CBZ).
    pub authors: Vec<String>,
    /// Langue (EPUB, ou `LanguageISO` de `ComicInfo.xml` pour un CBZ).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub language: Option<String>,
    /// Série (métadonnées EPUB ou `ComicInfo.xml`, sinon déduite du nom de fichier).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub series_title: Option<String>,
    /// Volume dans la série (pour un chapitre : son volume, s'il est connu).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub volume: Option<f64>,
    /// Numéro de chapitre, si le fichier est un chapitre (nom de fichier ou `ComicInfo.xml`).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub chapter: Option<f64>,
    /// Titre du chapitre (`Title` de `ComicInfo.xml`, sinon texte suivant son numéro).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub chapter_title: Option<String>,
    /// Sens de lecture annoncé par le fichier (manga droite → gauche : spine EPUB `rtl`,
    /// `Manga` de `ComicInfo.xml`). Appliqué à la série quand elle est créée.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub direction: Option<ReadingDirection>,
    /// Nombre de pages : CBZ, ou manga EPUB fait de pages-images (lu comme un CBZ).
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
///   titre de repli et série éventuelle tirés du nom de fichier. Un EPUB qui est un manga
///   ou une BD (mise en page fixe, pages-images, sujet, sens `rtl` : voir
///   [`epub::ComicSignals`]) est classé `comic`, sa série lue aussi dans son titre.
/// - CBZ (toute archive ZIP contenant des images) : série, volume et chapitre tirés de
///   `ComicInfo.xml` s'il est présent, sinon du nom ; titre = nom du fichier ;
///   couverture = première page.
///
/// Renvoie [`CoreError::Unsupported`] pour tout autre contenu.
pub fn analyze(name: &str, bytes: &[u8]) -> Result<Analysis> {
    let mut archive = zipread::open(bytes)?;
    let sha256 = hash::sha256(bytes);
    let size_bytes = bytes.len() as u64;
    let stem = clean_stem(name);
    let from_name = parse_name(name);

    if epub::is_epub(&mut archive)? {
        let meta = epub::read_metadata(&mut archive)?;
        // Un manga en EPUB sans métadonnées de série porte souvent série et volume dans son
        // titre (« One Piece - Tome 3 ») : on le lit avant le nom du fichier. Pas pour un
        // roman, dont le titre finit parfois par un nombre (« Fahrenheit 451 »).
        let from_title = meta
            .comic
            .then(|| meta.title.as_deref().and_then(parse_name))
            .flatten();
        let placement = match (meta.series_title, from_title.or(from_name)) {
            (Some(series), _) => Placement {
                series_title: Some(series),
                volume: meta.volume,
                ..Placement::default()
            },
            (None, Some(info)) => Placement::from(info),
            (None, None) => Placement::default(),
        };
        let kind = if meta.comic {
            WorkKind::Comic
        } else {
            WorkKind::Novel
        };
        // Manga fait d'images : ses pages se lisent comme celles d'un CBZ.
        let page_count = if meta.comic {
            epub::comic_page_paths(&mut archive)
                .ok()
                .map(|pages| u32::try_from(pages.len()).unwrap_or(u32::MAX))
                .filter(|&n| n > 0)
        } else {
            None
        };
        return Ok(Analysis {
            format: Format::Epub,
            kind,
            sha256,
            size_bytes,
            title: meta.title.unwrap_or(stem),
            authors: authors_or_name(meta.authors, name),
            language: meta.language,
            series_title: normalized(placement.series_title),
            volume: placement.volume,
            chapter: placement.chapter,
            chapter_title: placement.chapter_title,
            direction: (meta.comic && meta.rtl).then_some(ReadingDirection::Rtl),
            page_count,
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
    let info = cbz.comic_info().unwrap_or_default();
    let placement = Placement::for_comic(&info, from_name);
    Ok(Analysis {
        format: Format::Cbz,
        kind: WorkKind::Comic,
        sha256,
        size_bytes,
        title: stem,
        authors: authors_or_name(info.writers, name),
        language: info.language,
        series_title: normalized(placement.series_title),
        volume: placement.volume,
        chapter: placement.chapter,
        chapter_title: placement.chapter_title,
        direction: info.right_to_left.then_some(ReadingDirection::Rtl),
        page_count: Some(page_count),
        drm: false,
        cover: Some(cover),
    })
}

/// Auteurs des métadonnées, sinon celui d'un nom en segments (Anna's Archive).
fn authors_or_name(authors: Vec<String>, name: &str) -> Vec<String> {
    if authors.is_empty() {
        author_from_name(name).into_iter().collect()
    } else {
        authors
    }
}

/// Titre de série sous sa forme canonique ([`normalize_series_title`]) ; vide, il disparaît.
fn normalized(series_title: Option<String>) -> Option<String> {
    series_title
        .map(|title| normalize_series_title(&title))
        .filter(|title| !title.is_empty())
}

/// Place d'une œuvre dans sa série : série, volume, chapitre.
#[derive(Debug, Default, PartialEq)]
struct Placement {
    series_title: Option<String>,
    volume: Option<f64>,
    chapter: Option<f64>,
    chapter_title: Option<String>,
}

impl From<NameInfo> for Placement {
    fn from(info: NameInfo) -> Self {
        Self {
            series_title: Some(info.series_title),
            volume: info.volume,
            chapter: info.chapter,
            chapter_title: info.chapter_title,
        }
    }
}

impl Placement {
    /// Combine `ComicInfo.xml` (prioritaire) et le nom du fichier.
    ///
    /// `Number` est le numéro du chapitre, sauf s'il répète le volume d'un fichier que son nom
    /// ne désigne pas comme un chapitre : les outils d'étiquetage numérotent souvent un volume
    /// entier `Volume = Number = 3`.
    fn for_comic(info: &ComicInfo, from_name: Option<NameInfo>) -> Self {
        let name = from_name.map(Self::from).unwrap_or_default();
        let volume = info.volume.or(name.volume);
        let chapter = match info.number {
            Some(number) if name.chapter.is_none() && volume == Some(number) => None,
            Some(number) => Some(number),
            None => name.chapter,
        };
        let chapter_title = chapter.and(info.title.clone().or(name.chapter_title));
        Self {
            series_title: info.series.clone().or(name.series_title),
            volume,
            chapter,
            chapter_title,
        }
    }
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
    fn analyzes_a_chapter_from_its_name() {
        let bytes = fixtures::cbz_p1_to_p12();
        let analysis = analyze("One Piece Vol.105 Ch.1050 - Honneur.cbz", &bytes).unwrap();
        assert_eq!(analysis.series_title.as_deref(), Some("One Piece"));
        assert_eq!(analysis.volume, Some(105.0));
        assert_eq!(analysis.chapter, Some(1050.0));
        assert_eq!(analysis.chapter_title.as_deref(), Some("Honneur"));
        assert_eq!(analysis.title, "One Piece Vol.105 Ch.1050 - Honneur");

        let volume = analyze("One Piece v105.cbz", &bytes).unwrap();
        assert_eq!(volume.chapter, None);
        assert_eq!(volume.chapter_title, None);
    }

    #[test]
    fn comic_info_takes_precedence_over_the_name() {
        let bytes = fixtures::cbz_with_comic_info(
            "<ComicInfo><Series>One Piece</Series><Number>1050.5</Number>\
             <Volume>105</Volume><Title>Bonus</Title><Writer>Eiichiro Oda</Writer>\
             <LanguageISO>ja</LanguageISO></ComicInfo>",
        );
        let analysis = analyze("op_1050-5.cbz", &bytes).unwrap();
        assert_eq!(analysis.series_title.as_deref(), Some("One Piece"));
        assert_eq!(analysis.volume, Some(105.0));
        assert_eq!(analysis.chapter, Some(1050.5));
        assert_eq!(analysis.chapter_title.as_deref(), Some("Bonus"));
        assert_eq!(analysis.authors, ["Eiichiro Oda"]);
        assert_eq!(analysis.language.as_deref(), Some("ja"));
        assert_eq!(analysis.page_count, Some(2));

        // Chapitre sans volume connu : le nom donne la série, ComicInfo le numéro.
        let bytes = fixtures::cbz_with_comic_info("<ComicInfo><Number>12</Number></ComicInfo>");
        let analysis = analyze("Saga - Chapitre 11.cbz", &bytes).unwrap();
        assert_eq!(analysis.series_title.as_deref(), Some("Saga"));
        assert_eq!(analysis.volume, None);
        assert_eq!(analysis.chapter, Some(12.0));
    }

    #[test]
    fn comic_info_number_of_a_volume_is_not_a_chapter() {
        let bytes = fixtures::cbz_with_comic_info(
            "<ComicInfo><Series>Saga</Series><Number>3</Number><Volume>3</Volume>\
             <Title>Le tome trois</Title></ComicInfo>",
        );
        let analysis = analyze("saga.cbz", &bytes).unwrap();
        assert_eq!(analysis.volume, Some(3.0));
        assert_eq!(analysis.chapter, None);
        assert_eq!(analysis.chapter_title, None);

        let bytes = fixtures::cbz_with_comic_info("<ComicInfo><Number>3</Number></ComicInfo>");
        let analysis = analyze("Saga T03.cbz", &bytes).unwrap();
        assert_eq!(analysis.volume, Some(3.0));
        assert_eq!(analysis.chapter, None);
    }

    const MANGA_META: &str = r#"<meta property="rendition:layout">pre-paginated</meta>
        <dc:subject>Manga</dc:subject>"#;
    const RTL: &str = r#"page-progression-direction="rtl""#;

    #[test]
    fn annas_archive_cbz_is_volume_13_of_one_piece() {
        let analysis = analyze(fixtures::ANNA_CBZ_NAME, &fixtures::cbz_scan()).unwrap();
        assert_eq!(analysis.kind, WorkKind::Comic);
        assert_eq!(analysis.title, "One Piece T013");
        assert_eq!(analysis.authors, ["Eiichiro Oda"]);
        assert_eq!(analysis.series_title.as_deref(), Some("One Piece"));
        assert_eq!(analysis.volume, Some(13.0));
        assert_eq!(analysis.chapter, None);
        assert_eq!(analysis.page_count, Some(3));
    }

    #[test]
    fn kindle_manga_epub_is_volume_67_of_one_piece() {
        let analysis = analyze(fixtures::ANNA_EPUB_NAME, &fixtures::epub_kindle_manga()).unwrap();
        assert_eq!(analysis.format, Format::Epub);
        assert_eq!(analysis.kind, WorkKind::Comic);
        assert_eq!(analysis.title, "One Piece, Vol. 67");
        assert_eq!(analysis.authors, ["Eiichiro Oda"]);
        assert_eq!(analysis.series_title.as_deref(), Some("One Piece"));
        assert_eq!(analysis.volume, Some(67.0));
        assert_eq!(analysis.chapter, None);
    }

    #[test]
    fn manga_epub_is_a_comic_in_its_series() {
        let bytes = fixtures::epub_comic(
            &format!(
                "{MANGA_META}<dc:title>One Piece 2</dc:title>
                 <meta name=\"calibre:series\" content=\"One  Piece\"/>
                 <meta name=\"calibre:series_index\" content=\"2\"/>"
            ),
            RTL,
            true,
        );
        let analysis = analyze("op.epub", &bytes).unwrap();
        assert_eq!(analysis.format, Format::Epub);
        assert_eq!(analysis.kind, WorkKind::Comic);
        assert_eq!(analysis.series_title.as_deref(), Some("One Piece"));
        assert_eq!(analysis.volume, Some(2.0));
        assert_eq!(analysis.direction, Some(ReadingDirection::Rtl));
        // Fait de pages-images : il se lit page par page, comme un CBZ.
        assert_eq!(analysis.page_count, Some(4));
    }

    #[test]
    fn manga_epub_series_from_its_title() {
        let bytes = fixtures::epub_comic(
            &format!("{MANGA_META}<dc:title>L’Attaque des Titans - Chapitre 139</dc:title>"),
            "",
            true,
        );
        let analysis = analyze("snk.epub", &bytes).unwrap();
        assert_eq!(analysis.kind, WorkKind::Comic);
        assert_eq!(
            analysis.series_title.as_deref(),
            Some("L'Attaque des Titans")
        );
        assert_eq!(analysis.chapter, Some(139.0));
        assert_eq!(analysis.direction, None);
        assert_eq!(analysis.page_count, Some(4));
        // Un manga Kindle sans pages-images reconnaissables reste lu comme un livre.
        let kindle = analyze("op.epub", &fixtures::epub_kindle_manga()).unwrap();
        assert_eq!(kindle.kind, WorkKind::Comic);
        assert_eq!(kindle.page_count, None);
    }

    #[test]
    fn novel_title_is_not_parsed() {
        let bytes = fixtures::epub_comic("<dc:title>Fahrenheit 451</dc:title>", RTL, false);
        let analysis = analyze("f451.epub", &bytes).unwrap();
        assert_eq!(analysis.kind, WorkKind::Novel);
        assert_eq!(analysis.series_title, None);
        assert_eq!(analysis.direction, None);
    }

    #[test]
    fn cbz_manga_flag_sets_the_direction() {
        let bytes = fixtures::cbz_with_comic_info(
            "<ComicInfo><Manga>YesAndRightToLeft</Manga></ComicInfo>",
        );
        let analysis = analyze("Saga v01.cbz", &bytes).unwrap();
        assert_eq!(analysis.kind, WorkKind::Comic);
        assert_eq!(analysis.direction, Some(ReadingDirection::Rtl));
        let plain = analyze("Saga v02.cbz", &fixtures::cbz_p1_to_p12()).unwrap();
        assert_eq!(plain.direction, None);
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
