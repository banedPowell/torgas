//! Métadonnées des livres EPUB (2 et 3).

use crate::cbz::{Page, image_mime};
use crate::error::{CoreError, Result};
use crate::naming::fold;
use crate::xml::{self, Element};
use crate::zipread::{self, MemArchive};

/// Type MIME attendu dans l'entrée `mimetype` d'un EPUB.
pub const EPUB_MIMETYPE: &str = "application/epub+zip";

/// Algorithmes d'obfuscation de polices : ils n'empêchent pas la lecture et
/// ne sont donc pas considérés comme une DRM.
const FONT_OBFUSCATION: [&str; 2] = [
    "http://www.idpf.org/2008/embedding",
    "http://ns.adobe.com/pdf/enc#RC",
];

/// Métadonnées extraites de l'OPF d'un EPUB.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct EpubMetadata {
    /// Titre principal (`dc:title`).
    pub title: Option<String>,
    /// Auteurs (`dc:creator`), dans l'ordre du document.
    pub authors: Vec<String>,
    /// Langue (`dc:language`), code BCP 47.
    pub language: Option<String>,
    /// Série (`calibre:series` ou `belongs-to-collection` EPUB 3).
    pub series_title: Option<String>,
    /// Position dans la série (`calibre:series_index` ou `group-position`).
    pub volume: Option<f64>,
    /// Image de couverture, si elle est déclarée et présente dans l'archive.
    pub cover: Option<Page>,
    /// Le livre est protégé par une DRM et ne pourra pas être lu.
    pub drm: bool,
    /// Le livre est un manga ou une bande dessinée (voir [`ComicSignals::is_comic`]).
    pub comic: bool,
    /// Sens de lecture droite → gauche (`page-progression-direction="rtl"`).
    pub rtl: bool,
}

/// Mots-clés de `dc:subject` qui désignent une bande dessinée (minuscules, sans accents).
const COMIC_SUBJECTS: [&str; 13] = [
    "manga",
    "mangas",
    "manhwa",
    "manhua",
    "webtoon",
    "comic",
    "comics",
    "bd",
    "bande dessinee",
    "bandes dessinees",
    "graphic novel",
    "graphic novels",
    "roman graphique",
];

/// Sections du spine examinées pour compter les pages-images (les premières suffisent).
const SAMPLED_SECTIONS: usize = 60;

/// Indices qu'un EPUB est un manga ou une bande dessinée.
// Des indices indépendants, chacun lu tel quel dans l'OPF : pas une machine à états.
#[allow(clippy::struct_excessive_bools)]
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct ComicSignals {
    /// Mise en page fixe (`rendition:layout` `pre-paginated`, ou `fixed-layout` Kindle).
    pub fixed_layout: bool,
    /// `page-progression-direction="rtl"` sur le spine.
    pub rtl: bool,
    /// Un `dc:subject` parle de manga, comics, bande dessinée…
    pub comic_subject: bool,
    /// Métadonnée Kindle `book-type` à `comic`.
    pub comic_book_type: bool,
    /// Sections examinées, et parmi elles celles faites d'une seule image.
    pub sections: usize,
    /// Sections constituées d'une seule image (sans texte).
    pub image_sections: usize,
}

impl ComicSignals {
    /// La majorité des sections examinées (au moins deux) sont des pages-images.
    pub fn mostly_images(&self) -> bool {
        self.sections >= 2 && self.image_sections * 2 > self.sections
    }

    /// Verdict : pages-images en majorité, `book-type` comic, ou sujet « manga/BD » confirmé
    /// par une mise en page fixe ou un sens de lecture droite → gauche.
    pub fn is_comic(&self) -> bool {
        self.comic_book_type
            || self.mostly_images()
            || (self.comic_subject && (self.fixed_layout || self.rtl))
    }
}

/// Indique si l'archive est un EPUB : entrée `mimetype` valant
/// `application/epub+zip`, ou à défaut présence de `META-INF/container.xml`.
pub(crate) fn is_epub<B: AsRef<[u8]>>(archive: &mut MemArchive<B>) -> Result<bool> {
    if let Some(mimetype) = zipread::read_name(archive, "mimetype")? {
        return Ok(String::from_utf8_lossy(&mimetype).trim() == EPUB_MIMETYPE);
    }
    Ok(archive.index_for_name("META-INF/container.xml").is_some())
}

/// Lit les métadonnées d'un EPUB.
///
/// Suit `META-INF/container.xml` jusqu'à l'OPF, puis extrait titre, auteurs,
/// langue, série, volume et couverture. Détecte aussi la DRM : un livre
/// protégé renvoie quand même ses métadonnées (souvent lisibles), avec
/// `drm = true`.
pub fn metadata(bytes: &[u8]) -> Result<EpubMetadata> {
    let mut archive = zipread::open(bytes)?;
    if !is_epub(&mut archive)? {
        return Err(CoreError::Unsupported(
            "archive ZIP qui n'est pas un EPUB".to_owned(),
        ));
    }
    read_metadata(&mut archive)
}

pub(crate) fn read_metadata<B: AsRef<[u8]>>(archive: &mut MemArchive<B>) -> Result<EpubMetadata> {
    let drm = detect_drm(archive)?;
    let opf_path = opf_path(archive)?;
    let opf = zipread::read_text(archive, &opf_path)?
        .ok_or_else(|| CoreError::InvalidEpub(format!("OPF introuvable : {opf_path}")))?;
    let elements = xml::parse(&opf_path, &opf)?;
    let mut meta = parse_opf(&elements);
    meta.drm = drm;
    let signals = comic_signals(archive, &opf_path, &elements);
    meta.comic = signals.is_comic();
    meta.rtl = signals.rtl;

    if let Some((href, mime)) = cover_item(&elements) {
        let path = resolve_href(&opf_path, &href);
        if let Some(bytes) = zipread::read_name(archive, &path)? {
            meta.cover = Some(Page { mime, bytes });
        }
    }
    Ok(meta)
}

/// Chemin de l'OPF déclaré dans `META-INF/container.xml`.
fn opf_path<B: AsRef<[u8]>>(archive: &mut MemArchive<B>) -> Result<String> {
    const CONTAINER: &str = "META-INF/container.xml";
    let container = zipread::read_text(archive, CONTAINER)?
        .ok_or_else(|| CoreError::InvalidEpub(format!("{CONTAINER} absent")))?;
    let elements = xml::parse(CONTAINER, &container)?;
    let rootfiles: Vec<&Element> = elements.iter().filter(|e| e.name == "rootfile").collect();
    rootfiles
        .iter()
        .find(|e| e.attr("media-type") == Some("application/oebps-package+xml"))
        .or_else(|| rootfiles.first())
        .and_then(|e| e.attr("full-path"))
        .map(|path| percent_decode(path.trim_start_matches('/')))
        .ok_or_else(|| CoreError::InvalidEpub("aucun rootfile dans container.xml".to_owned()))
}

/// Détecte une DRM : `META-INF/rights.xml` (Adobe) ou `META-INF/encryption.xml`
/// qui chiffre autre chose que des polices obfusquées.
fn detect_drm<B: AsRef<[u8]>>(archive: &mut MemArchive<B>) -> Result<bool> {
    const ENCRYPTION: &str = "META-INF/encryption.xml";
    if archive.index_for_name("META-INF/rights.xml").is_some() {
        return Ok(true);
    }
    let Some(encryption) = zipread::read_text(archive, ENCRYPTION)? else {
        return Ok(false);
    };
    let elements = xml::parse(ENCRYPTION, &encryption)?;
    Ok(elements
        .iter()
        .filter(|e| e.name == "EncryptionMethod" && e.is_inside("EncryptedData"))
        .any(|e| {
            e.attr("Algorithm")
                .is_none_or(|algorithm| !FONT_OBFUSCATION.contains(&algorithm))
        }))
}

fn non_empty(text: &str) -> Option<String> {
    let text = text.trim();
    (!text.is_empty()).then(|| text.to_owned())
}

fn parse_number(text: &str) -> Option<f64> {
    let value: f64 = text.trim().replace(',', ".").parse().ok()?;
    (value.is_finite() && value >= 0.0).then_some(value)
}

fn parse_opf(elements: &[Element]) -> EpubMetadata {
    let mut meta = EpubMetadata::default();
    let in_metadata = elements.iter().filter(|e| e.is_inside("metadata"));

    let mut calibre_series = None;
    let mut calibre_index = None;
    // EPUB 3 : (id, titre) des collections, puis raffinements par id.
    let mut collections: Vec<(Option<String>, String)> = Vec::new();

    for element in in_metadata.clone() {
        match element.name.as_str() {
            "title" if meta.title.is_none() => meta.title = non_empty(&element.text),
            "language" if meta.language.is_none() => meta.language = non_empty(&element.text),
            "creator" => {
                let role = element.attr("role");
                if role.is_none_or(|role| role == "aut")
                    && let Some(name) = non_empty(&element.text)
                {
                    meta.authors.push(name);
                }
            }
            "meta" => match (element.attr("name"), element.attr("property")) {
                (Some("calibre:series"), _) => {
                    calibre_series = element.attr("content").and_then(non_empty);
                }
                (Some("calibre:series_index"), _) => {
                    calibre_index = element.attr("content").and_then(parse_number);
                }
                (_, Some("belongs-to-collection")) => {
                    if let Some(title) = non_empty(&element.text) {
                        collections.push((element.attr("id").map(str::to_owned), title));
                    }
                }
                _ => {}
            },
            _ => {}
        }
    }

    // EPUB 3 : `refines="#id"` porte le type de collection et la position.
    let refinement = |id: &str, property: &str| {
        in_metadata
            .clone()
            .find(|e| {
                e.name == "meta"
                    && e.attr("property") == Some(property)
                    && e.attr("refines").and_then(|r| r.strip_prefix('#')) == Some(id)
            })
            .map(|e| e.text.clone())
    };
    let epub3_series = collections
        .iter()
        .find(|(id, _)| {
            id.as_deref()
                .and_then(|id| refinement(id, "collection-type"))
                .is_none_or(|kind| kind == "series")
        })
        .map(|(id, title)| {
            let position = id
                .as_deref()
                .and_then(|id| refinement(id, "group-position"))
                .and_then(|text| parse_number(&text));
            (title.clone(), position)
        });

    if let Some(series) = calibre_series {
        meta.series_title = Some(series);
        meta.volume = calibre_index;
    } else if let Some((series, position)) = epub3_series {
        meta.series_title = Some(series);
        meta.volume = position;
    }
    meta
}

/// Un sujet (`dc:subject`) désigne-t-il une bande dessinée ? Comparaison par mots entiers :
/// « Comics & Graphic Novels / Manga », « Bande dessinée », « BD » le sont, « Bdsm » non.
fn is_comic_subject(subject: &str) -> bool {
    let words: Vec<String> = fold(subject)
        .split(|c: char| !c.is_alphanumeric())
        .filter(|word| !word.is_empty())
        .map(str::to_owned)
        .collect();
    let joined = format!(" {} ", words.join(" "));
    COMIC_SUBJECTS
        .iter()
        .any(|keyword| joined.contains(&format!(" {keyword} ")))
}

/// Une section XHTML est-elle une page-image : une seule image (`img` ou `image` SVG) dans
/// le corps, et (presque) pas de texte ? Un document illisible n'en est pas une.
fn is_image_page(path: &str, xhtml: &str) -> bool {
    let Ok(elements) = xml::parse(path, xhtml) else {
        return false;
    };
    let body: Vec<&Element> = elements
        .iter()
        .filter(|e| e.is_inside("body") && !e.is_inside("script") && !e.is_inside("style"))
        .collect();
    let images = body
        .iter()
        .filter(|e| e.name == "img" || e.name == "image")
        .count();
    let text: usize = body
        .iter()
        .filter(|e| e.name != "script" && e.name != "style")
        .map(|e| e.text.chars().filter(|c| !c.is_whitespace()).count())
        .sum();
    images == 1 && text <= 40
}

/// Rassemble les indices « manga/BD » d'un EPUB : métadonnées de l'OPF, sens du spine et
/// nature des premières sections.
fn comic_signals<B: AsRef<[u8]>>(
    archive: &mut MemArchive<B>,
    opf_path: &str,
    elements: &[Element],
) -> ComicSignals {
    let in_metadata = || elements.iter().filter(|e| e.is_inside("metadata"));
    let mut signals = ComicSignals {
        fixed_layout: in_metadata().any(|e| {
            e.name == "meta"
                && ((e.attr("property") == Some("rendition:layout") && e.text == "pre-paginated")
                    || (e.attr("name") == Some("fixed-layout")
                        && e.attr("content") == Some("true")))
        }),
        rtl: elements
            .iter()
            .any(|e| e.name == "spine" && e.attr("page-progression-direction") == Some("rtl")),
        comic_subject: in_metadata().any(|e| e.name == "subject" && is_comic_subject(&e.text)),
        comic_book_type: in_metadata().any(|e| {
            e.name == "meta"
                && e.attr("name") == Some("book-type")
                && e.attr("content")
                    .is_some_and(|c| c.eq_ignore_ascii_case("comic"))
        }),
        ..ComicSignals::default()
    };

    let items: Vec<&Element> = elements
        .iter()
        .filter(|e| e.name == "item" && e.is_inside("manifest"))
        .collect();
    let spine = elements
        .iter()
        .filter(|e| e.name == "itemref" && e.is_inside("spine"))
        .filter_map(|itemref| {
            let id = itemref.attr("idref")?;
            items.iter().find(|item| item.attr("id") == Some(id))
        })
        .take(SAMPLED_SECTIONS);
    for item in spine {
        let (Some(href), mime) = (item.attr("href"), item.attr("media-type").unwrap_or("")) else {
            continue;
        };
        signals.sections += 1;
        let image_page = if mime.starts_with("image/") {
            true
        } else {
            let path = resolve_href(opf_path, href);
            zipread::read_text(archive, &path)
                .ok()
                .flatten()
                .is_some_and(|xhtml| is_image_page(&path, &xhtml))
        };
        signals.image_sections += usize::from(image_page);
    }
    signals
}

/// Repère l'image de couverture dans le manifeste : `properties="cover-image"`
/// (EPUB 3), `<meta name="cover">` (EPUB 2), puis un élément d'id `cover`.
/// Renvoie (href relatif à l'OPF, type MIME).
fn cover_item(elements: &[Element]) -> Option<(String, String)> {
    let items: Vec<&Element> = elements
        .iter()
        .filter(|e| e.name == "item" && e.is_inside("manifest"))
        .collect();
    let is_image = |item: &&&Element| {
        item.attr("media-type")
            .is_some_and(|mime| mime.starts_with("image/"))
            || item.attr("href").and_then(image_mime).is_some()
    };

    let epub3 = items.iter().find(|item| {
        item.attr("properties")
            .is_some_and(|props| props.split_whitespace().any(|p| p == "cover-image"))
    });
    let epub2 = || {
        let id = elements
            .iter()
            .find(|e| e.name == "meta" && e.attr("name") == Some("cover"))?
            .attr("content")?;
        items
            .iter()
            .find(|item| item.attr("id") == Some(id))
            .or_else(|| items.iter().find(|item| item.attr("href") == Some(id)))
    };
    let by_id = || {
        items.iter().filter(is_image).find(|item| {
            item.attr("id")
                .is_some_and(|id| id.eq_ignore_ascii_case("cover"))
        })
    };

    let item = epub3.or_else(epub2).filter(is_image).or_else(by_id)?;
    let href = item.attr("href")?;
    let mime = item
        .attr("media-type")
        .filter(|mime| mime.starts_with("image/"))
        .or_else(|| image_mime(href))?;
    Some((href.to_owned(), mime.to_owned()))
}

/// Pages d'un EPUB manga, dans l'ordre du spine : l'image de chaque section (section image,
/// ou première `img` / `image` SVG de son corps). Les sections sans image (crédits, texte)
/// sont sautées. Liste vide si les sections d'une image ne sont pas majoritaires : le livre
/// se lit alors comme un livre, pas comme des planches.
pub(crate) fn comic_page_paths<B: AsRef<[u8]>>(archive: &mut MemArchive<B>) -> Result<Vec<String>> {
    let opf_path = opf_path(archive)?;
    let opf = zipread::read_text(archive, &opf_path)?
        .ok_or_else(|| CoreError::InvalidEpub(format!("OPF introuvable : {opf_path}")))?;
    let elements = xml::parse(&opf_path, &opf)?;
    let items: Vec<&Element> = elements
        .iter()
        .filter(|e| e.name == "item" && e.is_inside("manifest"))
        .collect();
    let sections: Vec<(String, String)> = elements
        .iter()
        .filter(|e| e.name == "itemref" && e.is_inside("spine"))
        .filter_map(|itemref| {
            let id = itemref.attr("idref")?;
            let item = items.iter().find(|item| item.attr("id") == Some(id))?;
            let href = item.attr("href")?;
            let mime = item.attr("media-type").unwrap_or_default().to_owned();
            Some((resolve_href(&opf_path, href), mime))
        })
        .collect();
    let mut pages = Vec::new();
    for (path, mime) in &sections {
        if mime.starts_with("image/") {
            pages.push(path.clone());
            continue;
        }
        let Ok(Some(xhtml)) = zipread::read_text(archive, path) else {
            continue;
        };
        if is_image_page(path, &xhtml)
            && let Some(src) = section_image(path, &xhtml)
        {
            pages.push(resolve_href(path, &src));
        }
    }
    if pages.len() * 2 <= sections.len() {
        pages.clear();
    }
    Ok(pages)
}

/// Source de la première image du corps d'une section (`img src`, `image xlink:href`).
fn section_image(path: &str, xhtml: &str) -> Option<String> {
    let elements = xml::parse(path, xhtml).ok()?;
    elements
        .iter()
        .filter(|e| e.is_inside("body"))
        .find_map(|e| match e.name.as_str() {
            "img" => e.attr("src"),
            "image" => e.attr("href"),
            _ => None,
        })
        .map(str::to_owned)
}

/// Résout `href` (relatif à l'OPF) en chemin d'archive : retire fragment et
/// requête, décode les `%XX` et normalise `.`/`..`.
fn resolve_href(opf_path: &str, href: &str) -> String {
    let href = href.split(['#', '?']).next().unwrap_or_default();
    let base = opf_path.rsplit_once('/').map_or("", |(dir, _)| dir);
    let joined = if href.starts_with('/') || base.is_empty() {
        href.trim_start_matches('/').to_owned()
    } else {
        format!("{base}/{href}")
    };
    let mut parts: Vec<&str> = Vec::new();
    for part in joined.split('/') {
        match part {
            "" | "." => {}
            ".." => {
                parts.pop();
            }
            other => parts.push(other),
        }
    }
    percent_decode(&parts.join("/"))
}

/// Décode les séquences `%XX` d'une URL relative (UTF-8 invalide conservé tel quel).
fn percent_decode(input: &str) -> String {
    let bytes = input.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%'
            && let Some(hex) = input.get(i + 1..i + 3)
            && let Ok(byte) = u8::from_str_radix(hex, 16)
        {
            out.push(byte);
            i += 3;
        } else {
            out.push(bytes[i]);
            i += 1;
        }
    }
    String::from_utf8(out).unwrap_or_else(|_| input.to_owned())
}

#[cfg(test)]
#[allow(clippy::float_cmp)]
mod tests {
    use super::*;
    use crate::fixtures;

    #[test]
    fn comic_pages_follow_the_spine() {
        let bytes = fixtures::epub_comic("<dc:title>Saga</dc:title>", "", true);
        let mut archive = zipread::open(bytes.as_slice()).unwrap();
        let pages = comic_page_paths(&mut archive).unwrap();
        assert_eq!(
            pages,
            [
                "OEBPS/images/p1.jpg",
                "OEBPS/images/p2.jpg",
                "OEBPS/images/p3.jpg",
                "OEBPS/images/p4.jpg"
            ]
        );
    }

    #[test]
    fn text_book_has_no_comic_pages() {
        let bytes = fixtures::epub_kindle_manga();
        let mut archive = zipread::open(bytes.as_slice()).unwrap();
        assert_eq!(
            comic_page_paths(&mut archive).unwrap(),
            Vec::<String>::new()
        );
    }

    #[test]
    fn epub2_metadata() {
        let meta = metadata(&fixtures::epub2()).unwrap();
        assert_eq!(meta.title.as_deref(), Some("Le Comte de Monte-Cristo"));
        assert_eq!(meta.authors, ["Alexandre Dumas", "Auguste Maquet"]);
        assert_eq!(meta.language.as_deref(), Some("fr"));
        assert_eq!(meta.series_title.as_deref(), Some("Monte-Cristo"));
        assert_eq!(meta.volume, Some(2.0));
        let cover = meta.cover.unwrap();
        assert_eq!(cover.mime, "image/jpeg");
        assert_eq!(cover.bytes, fixtures::jpeg_bytes(42));
        assert!(!meta.drm);
    }

    #[test]
    fn epub3_metadata() {
        let meta = metadata(&fixtures::epub3()).unwrap();
        assert_eq!(meta.title.as_deref(), Some("Les Misérables & co"));
        assert_eq!(meta.authors, ["Victor Hugo"]);
        assert_eq!(meta.language.as_deref(), Some("fr-FR"));
        assert_eq!(meta.series_title.as_deref(), Some("Les Misérables"));
        assert_eq!(meta.volume, Some(1.5));
        let cover = meta.cover.unwrap();
        assert_eq!(cover.mime, "image/png");
        assert_eq!(cover.bytes, fixtures::png_bytes());
        assert!(!meta.drm);
    }

    #[test]
    fn font_obfuscation_is_not_drm() {
        let meta = metadata(&fixtures::epub_with_obfuscated_fonts()).unwrap();
        assert!(!meta.drm);
    }

    #[test]
    fn encrypted_content_is_drm() {
        let meta = metadata(&fixtures::epub_with_drm()).unwrap();
        assert!(meta.drm);
        assert_eq!(meta.title.as_deref(), Some("Livre protégé"));
    }

    #[test]
    fn rights_xml_is_drm() {
        let meta = metadata(&fixtures::epub_with_rights_xml()).unwrap();
        assert!(meta.drm);
    }

    #[test]
    fn plain_zip_is_not_an_epub() {
        let err = metadata(&fixtures::zip_not_a_book()).unwrap_err();
        assert!(matches!(err, CoreError::Unsupported(_)));
    }

    #[test]
    fn missing_opf_is_invalid() {
        let err = metadata(&fixtures::epub_without_opf()).unwrap_err();
        assert!(matches!(err, CoreError::InvalidEpub(_)));
    }

    const FIXED: &str = r#"<meta property="rendition:layout">pre-paginated</meta>"#;
    const MANGA: &str = "<dc:subject>Comics &amp; Graphic Novels / Manga</dc:subject>";

    fn signals(metadata: &str, spine: &str, images: bool) -> ComicSignals {
        let bytes = fixtures::epub_comic(metadata, spine, images);
        let mut archive = zipread::open(bytes.as_slice()).unwrap();
        let opf_path = opf_path(&mut archive).unwrap();
        let opf = zipread::read_text(&mut archive, &opf_path)
            .unwrap()
            .unwrap();
        let elements = xml::parse(&opf_path, &opf).unwrap();
        comic_signals(&mut archive, &opf_path, &elements)
    }

    #[test]
    fn reads_comic_signals() {
        let s = signals(
            &format!("{FIXED}{MANGA}<dc:title>T</dc:title>"),
            r#"page-progression-direction="rtl""#,
            true,
        );
        assert_eq!(
            s,
            ComicSignals {
                fixed_layout: true,
                rtl: true,
                comic_subject: true,
                comic_book_type: false,
                sections: 4,
                image_sections: 4,
            }
        );
        assert!(s.is_comic());
    }

    #[test]
    fn image_pages_alone_make_a_comic() {
        let s = signals("<dc:title>T</dc:title>", "", true);
        assert!(s.mostly_images());
        assert!(s.is_comic());
    }

    #[test]
    fn subject_needs_layout_or_direction() {
        let text_only = signals(&format!("{MANGA}<dc:title>T</dc:title>"), "", false);
        assert!(text_only.comic_subject);
        assert!(
            !text_only.is_comic(),
            "un essai sur le manga reste un livre"
        );
        let rtl = signals(
            &format!("{MANGA}<dc:title>T</dc:title>"),
            r#"page-progression-direction="rtl""#,
            false,
        );
        assert!(rtl.is_comic());
        let fixed = signals(&format!("{FIXED}<dc:title>T</dc:title>"), "", false);
        assert!(
            fixed.fixed_layout && !fixed.is_comic(),
            "album illustré à mise en page fixe"
        );
        let kindle = signals(
            r#"<meta name="book-type" content="comic"/><dc:title>T</dc:title>"#,
            "",
            false,
        );
        assert!(kindle.is_comic());
    }

    #[test]
    fn novels_are_not_comics() {
        for bytes in [
            fixtures::epub2(),
            fixtures::epub3(),
            fixtures::epub_minimal(),
        ] {
            let meta = metadata(&bytes).unwrap();
            assert!(!meta.comic);
            assert!(!meta.rtl);
        }
    }

    #[test]
    fn comic_subjects() {
        for subject in [
            "Manga",
            "Bande dessinée",
            "BD jeunesse",
            "COMICS",
            "Roman graphique",
        ] {
            assert!(is_comic_subject(subject), "{subject}");
        }
        for subject in ["Bdsm", "Mangaka", "Roman", "Science-fiction"] {
            assert!(!is_comic_subject(subject), "{subject}");
        }
    }

    #[test]
    fn hrefs_are_resolved() {
        assert_eq!(
            resolve_href("OEBPS/content.opf", "images/c.jpg"),
            "OEBPS/images/c.jpg"
        );
        assert_eq!(
            resolve_href("OEBPS/content.opf", "../c%20v.jpg#x"),
            "c v.jpg"
        );
        assert_eq!(resolve_href("content.opf", "./a/b.png"), "a/b.png");
        assert_eq!(percent_decode("%C3%A9t%C3%A9%zz"), "été%zz");
    }
}
