//! Fichiers d'exemple générés pour les tests (aucun téléchargement).

use std::io::{Cursor, Write};

use image::{ImageFormat, Rgb, RgbImage};
use zip::CompressionMethod;
use zip::write::{SimpleFileOptions, ZipWriter};

/// Construit une archive ZIP ; `mimetype` est stocké sans compression comme
/// l'exige la spécification EPUB.
pub fn zip(entries: &[(&str, &[u8])]) -> Vec<u8> {
    let mut writer = ZipWriter::new(Cursor::new(Vec::new()));
    for (name, content) in entries {
        let method = if *name == "mimetype" {
            CompressionMethod::Stored
        } else {
            CompressionMethod::Deflated
        };
        if name.ends_with('/') {
            writer
                .add_directory(*name, SimpleFileOptions::default())
                .unwrap();
            continue;
        }
        writer
            .start_file(
                *name,
                SimpleFileOptions::default().compression_method(method),
            )
            .unwrap();
        writer.write_all(content).unwrap();
    }
    writer.finish().unwrap().into_inner()
}

/// Faux contenu JPEG (non décodable), distinct pour chaque `n`.
pub fn jpeg_bytes(n: u32) -> Vec<u8> {
    let mut bytes = vec![0xFF, 0xD8, 0xFF, 0xE0];
    bytes.extend_from_slice(format!("page {n}").as_bytes());
    bytes
}

/// PNG réel de `width` × `height` pixels (dégradé).
pub fn png_of_size(width: u32, height: u32) -> Vec<u8> {
    encode(width, height, ImageFormat::Png)
}

/// JPEG réel de `width` × `height` pixels.
pub fn real_jpeg(width: u32, height: u32) -> Vec<u8> {
    encode(width, height, ImageFormat::Jpeg)
}

/// Petit PNG réel (4 × 6).
pub fn png_bytes() -> Vec<u8> {
    png_of_size(4, 6)
}

fn encode(width: u32, height: u32, format: ImageFormat) -> Vec<u8> {
    let image = RgbImage::from_fn(width, height, |x, y| {
        Rgb([(x % 256) as u8, (y % 256) as u8, 128])
    });
    let mut out = Cursor::new(Vec::new());
    image.write_to(&mut out, format).unwrap();
    out.into_inner()
}

const CONTAINER: &str = r#"<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>"#;

const CHAPTER: &[u8] =
    b"<html xmlns=\"http://www.w3.org/1999/xhtml\"><body><p>Bonjour</p></body></html>";

fn epub_with(opf: &str, extra: &[(&str, &[u8])]) -> Vec<u8> {
    let mut entries: Vec<(&str, &[u8])> = vec![
        ("mimetype", b"application/epub+zip"),
        ("META-INF/container.xml", CONTAINER.as_bytes()),
        ("OEBPS/content.opf", opf.as_bytes()),
        ("OEBPS/chapitre1.xhtml", CHAPTER),
    ];
    entries.extend_from_slice(extra);
    zip(&entries)
}

/// EPUB 2 : `opf:role`, `<meta name="cover">`, série Calibre.
pub fn epub2() -> Vec<u8> {
    let opf = r#"<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="2.0" unique-identifier="uid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:opf="http://www.idpf.org/2007/opf">
    <dc:title>Le Comte de Monte-Cristo</dc:title>
    <dc:creator opf:role="aut">Alexandre Dumas</dc:creator>
    <dc:creator>Auguste Maquet</dc:creator>
    <dc:creator opf:role="ill">Un Illustrateur</dc:creator>
    <dc:language>fr</dc:language>
    <dc:identifier id="uid">urn:uuid:1</dc:identifier>
    <meta name="cover" content="img-cover"/>
    <meta name="calibre:series" content="Monte-Cristo"/>
    <meta name="calibre:series_index" content="2.0"/>
  </metadata>
  <manifest>
    <item id="ch1" href="chapitre1.xhtml" media-type="application/xhtml+xml"/>
    <item id="img-cover" href="images/couverture%20v2.jpg" media-type="image/jpeg"/>
  </manifest>
  <spine><itemref idref="ch1"/></spine>
</package>"#;
    let cover = jpeg_bytes(42);
    epub_with(opf, &[("OEBPS/images/couverture v2.jpg", &cover)])
}

/// EPUB 3 : `properties="cover-image"`, `belongs-to-collection`, entités.
pub fn epub3() -> Vec<u8> {
    let opf = r##"<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="uid">urn:uuid:2</dc:identifier>
    <dc:title id="t1">Les Misérables &amp; co</dc:title>
    <dc:title id="t2">Sous-titre</dc:title>
    <dc:creator id="c1">Victor Hugo</dc:creator>
    <dc:language>fr-FR</dc:language>
    <meta property="dcterms:modified">2026-01-01T00:00:00Z</meta>
    <meta property="belongs-to-collection" id="col">Les Misérables</meta>
    <meta refines="#col" property="collection-type">series</meta>
    <meta refines="#col" property="group-position">1.5</meta>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="ch1" href="chapitre1.xhtml" media-type="application/xhtml+xml"/>
    <item id="cv" href="../cover.png" media-type="image/png" properties="cover-image"/>
  </manifest>
  <spine><itemref idref="ch1"/></spine>
</package>"##;
    let cover = png_bytes();
    epub_with(opf, &[("cover.png", &cover)])
}

/// EPUB minimal : titre seulement, sans couverture ni série.
pub fn epub_minimal() -> Vec<u8> {
    epub_with(&minimal_opf("Saga"), &[])
}

fn minimal_opf(title: &str) -> String {
    format!(
        r#"<?xml version="1.0"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>{title}</dc:title>
  </metadata>
  <manifest><item id="ch1" href="chapitre1.xhtml" media-type="application/xhtml+xml"/></manifest>
  <spine><itemref idref="ch1"/></spine>
</package>"#
    )
}

fn encryption(algorithm: &str, uri: &str) -> String {
    format!(
        r#"<?xml version="1.0"?>
<encryption xmlns="urn:oasis:names:tc:opendocument:xmlns:container"
            xmlns:enc="http://www.w3.org/2001/04/xmlenc#">
  <enc:EncryptedData>
    <enc:EncryptionMethod Algorithm="{algorithm}"/>
    <enc:CipherData><enc:CipherReference URI="{uri}"/></enc:CipherData>
  </enc:EncryptedData>
</encryption>"#
    )
}

/// EPUB dont le contenu est chiffré (AES) : DRM.
pub fn epub_with_drm() -> Vec<u8> {
    let enc = encryption(
        "http://www.w3.org/2001/04/xmlenc#aes128-cbc",
        "OEBPS/chapitre1.xhtml",
    );
    epub_with(
        &minimal_opf("Livre protégé"),
        &[("META-INF/encryption.xml", enc.as_bytes())],
    )
}

/// EPUB avec polices obfusquées (IDPF) : pas une DRM.
pub fn epub_with_obfuscated_fonts() -> Vec<u8> {
    let enc = encryption("http://www.idpf.org/2008/embedding", "OEBPS/fonts/a.otf");
    epub_with(
        &minimal_opf("Polices"),
        &[("META-INF/encryption.xml", enc.as_bytes())],
    )
}

/// EPUB Adobe avec `rights.xml` : DRM.
pub fn epub_with_rights_xml() -> Vec<u8> {
    epub_with(
        &minimal_opf("Adobe"),
        &[("META-INF/rights.xml", b"<rights/>".as_slice())],
    )
}

/// EPUB dont le container pointe vers un OPF absent.
pub fn epub_without_opf() -> Vec<u8> {
    zip(&[
        ("mimetype", b"application/epub+zip"),
        ("META-INF/container.xml", CONTAINER.as_bytes()),
    ])
}

/// CBZ plat avec `p1.jpg` … `p12.jpg`, ajoutés dans le désordre.
pub fn cbz_p1_to_p12() -> Vec<u8> {
    let pages: Vec<(String, Vec<u8>)> = [7, 12, 1, 10, 2, 3, 11, 4, 5, 6, 8, 9]
        .iter()
        .map(|n| (format!("p{n}.jpg"), jpeg_bytes(*n)))
        .collect();
    let entries: Vec<(&str, &[u8])> = pages
        .iter()
        .map(|(name, bytes)| (name.as_str(), bytes.as_slice()))
        .collect();
    zip(&entries)
}

/// CBZ avec dossiers, `__MACOSX`, fichiers cachés et non-images.
pub fn cbz_with_folders() -> Vec<u8> {
    let img = jpeg_bytes(0);
    zip(&[
        ("Chapitre 10/", b""),
        ("Chapitre 10/001.avif", &img),
        ("Chapitre 2/001.gif", &img),
        ("Chapitre 1/002.webp", &img),
        ("Chapitre 1/001.png", &img),
        ("Chapitre 1/.DS_Store", b"x"),
        ("Chapitre 1/._001.png", &img),
        ("__MACOSX/Chapitre 1/._001.png", &img),
        (".cache/vignette.jpg", &img),
        ("ComicInfo.xml", b"<ComicInfo/>"),
        ("lisezmoi.txt", b"bonjour"),
    ])
}

/// Page XHTML faite d'une seule image (manga en EPUB).
fn image_page(n: u32) -> String {
    format!(
        r#"<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml"><head><title>p{n}</title></head>
<body><div class="page"><img src="images/p{n}.jpg" alt="Page {n}"/></div></body></html>"#
    )
}

/// EPUB d'un manga : `metadata` est inséré dans `<metadata>`, `spine_attrs` dans `<spine>` ;
/// quatre sections d'une image (`image_pages`) ou de texte.
pub fn epub_comic(metadata: &str, spine_attrs: &str, image_pages: bool) -> Vec<u8> {
    let opf = format!(
        r#"<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    {metadata}
  </metadata>
  <manifest>
    <item id="p1" href="p1.xhtml" media-type="application/xhtml+xml"/>
    <item id="p2" href="p2.xhtml" media-type="application/xhtml+xml"/>
    <item id="p3" href="p3.xhtml" media-type="application/xhtml+xml"/>
    <item id="p4" href="p4.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
  <spine {spine_attrs}>
    <itemref idref="p1"/><itemref idref="p2"/><itemref idref="p3"/><itemref idref="p4"/>
  </spine>
</package>"#
    );
    let pages: Vec<(String, Vec<u8>)> = (1..=4)
        .map(|n| {
            let body = if image_pages {
                image_page(n).into_bytes()
            } else {
                CHAPTER.to_vec()
            };
            (format!("OEBPS/p{n}.xhtml"), body)
        })
        .collect();
    let images: Vec<(String, Vec<u8>)> = (1..=4)
        .map(|n| (format!("OEBPS/images/p{n}.jpg"), jpeg_bytes(n)))
        .collect();
    let extra: Vec<(&str, &[u8])> = pages
        .iter()
        .chain(&images)
        .map(|(name, bytes)| (name.as_str(), bytes.as_slice()))
        .collect();
    epub_with(&opf, &extra)
}

/// Nom d'un CBZ téléchargé sur Anna's Archive (segments ` -- `, sans `ComicInfo.xml`).
pub const ANNA_CBZ_NAME: &str = "One Piece T013 -- Eiichiro Oda -- 2014 -- Glénat Manga -- \
    isbn13 9782331011634 -- 084d0c76c3d6157912abf8e80f0c6bca -- Anna’s Archive.cbz";

/// Nom d'un EPUB Kindle de la même série, téléchargé sur Anna's Archive.
pub const ANNA_EPUB_NAME: &str = "One Piece, Vol_ 67 67 -- Oda, Eiichiro -- One Piece #67, \
    2013 -- VIZ Media LLC -- 581d0c76c3d6157912abf8e80f0c6bca -- Anna’s Archive.epub";

/// CBZ façon scan d'éditeur : pages `109-00.jpg`, `109-01.jpg`…, pas de `ComicInfo.xml`.
pub fn cbz_scan() -> Vec<u8> {
    let pages: Vec<(String, Vec<u8>)> = (0..3)
        .map(|n| (format!("109-{n:02}.jpg"), jpeg_bytes(100 + n)))
        .collect();
    let entries: Vec<(&str, &[u8])> = pages
        .iter()
        .map(|(name, bytes)| (name.as_str(), bytes.as_slice()))
        .collect();
    zip(&entries)
}

/// EPUB Kindle d'un manga (métadonnées seules : `fixed-layout`, `book-type` comic, sujets),
/// titre `One Piece, Vol. 67`.
pub fn epub_kindle_manga() -> Vec<u8> {
    epub_comic(
        r#"<dc:title>One Piece, Vol. 67</dc:title>
           <dc:creator>Eiichiro Oda</dc:creator>
           <dc:subject>Manga</dc:subject>
           <dc:subject>Comics &amp; Graphic Novels</dc:subject>
           <dc:language>en</dc:language>
           <meta name="fixed-layout" content="true"/>
           <meta name="book-type" content="comic"/>"#,
        "",
        false,
    )
}

/// CBZ de deux pages accompagné de `ComicInfo.xml` (contenu `xml`).
pub fn cbz_with_comic_info(xml: &str) -> Vec<u8> {
    let (p1, p2) = (jpeg_bytes(1), jpeg_bytes(2));
    zip(&[
        ("001.jpg", &p1),
        ("002.jpg", &p2),
        ("ComicInfo.xml", xml.as_bytes()),
    ])
}

/// Archive ZIP qui n'est ni un EPUB ni un CBZ.
pub fn zip_not_a_book() -> Vec<u8> {
    zip(&[("notes.txt", b"rien"), ("data/a.json", b"{}")])
}
