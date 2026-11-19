//! Fichiers d'exemple générés pour les tests (aucun téléchargement).

use std::io::{Cursor, Write};

use image::{ImageFormat, Rgb, RgbImage};
use zip::CompressionMethod;
use zip::write::{SimpleFileOptions, ZipWriter};

fn zip(entries: &[(&str, Vec<u8>)]) -> Vec<u8> {
    let mut writer = ZipWriter::new(Cursor::new(Vec::new()));
    for (name, content) in entries {
        let method = if *name == "mimetype" {
            CompressionMethod::Stored
        } else {
            CompressionMethod::Deflated
        };
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

fn png(shade: u8) -> Vec<u8> {
    let image = RgbImage::from_fn(8, 12, |x, y| Rgb([x as u8 * 20, y as u8 * 20, shade]));
    let mut out = Cursor::new(Vec::new());
    image.write_to(&mut out, ImageFormat::Png).unwrap();
    out.into_inner()
}

/// CBZ de `pages` pages PNG réelles (`p1.png`, `p2.png`…).
pub fn cbz(pages: u8) -> Vec<u8> {
    let entries: Vec<_> = (1..=pages).map(|n| (format!("p{n}.png"), png(n))).collect();
    let entries: Vec<_> = entries
        .iter()
        .map(|(name, bytes)| (name.as_str(), bytes.clone()))
        .collect();
    zip(&entries)
}

/// EPUB 3 minimal ; `drm` ajoute un `encryption.xml` (contenu chiffré en AES).
pub fn epub(title: &str, author: &str, drm: bool) -> Vec<u8> {
    let container = r#"<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>"#;
    let opf = format!(
        r#"<?xml version="1.0"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>{title}</dc:title><dc:creator>{author}</dc:creator><dc:language>fr</dc:language>
  </metadata>
  <manifest><item id="ch1" href="ch1.xhtml" media-type="application/xhtml+xml"/></manifest>
  <spine><itemref idref="ch1"/></spine>
</package>"#
    );
    let mut entries = vec![
        ("mimetype", b"application/epub+zip".to_vec()),
        ("META-INF/container.xml", container.as_bytes().to_vec()),
        ("OEBPS/content.opf", opf.into_bytes()),
        (
            "OEBPS/ch1.xhtml",
            b"<html xmlns=\"http://www.w3.org/1999/xhtml\"><body><p>Bonjour</p></body></html>"
                .to_vec(),
        ),
    ];
    if drm {
        let enc = r#"<?xml version="1.0"?>
<encryption xmlns="urn:oasis:names:tc:opendocument:xmlns:container" xmlns:enc="http://www.w3.org/2001/04/xmlenc#">
  <enc:EncryptedData>
    <enc:EncryptionMethod Algorithm="http://www.w3.org/2001/04/xmlenc#aes128-cbc"/>
    <enc:CipherData><enc:CipherReference URI="OEBPS/ch1.xhtml"/></enc:CipherData>
  </enc:EncryptedData>
</encryption>"#;
        entries.push(("META-INF/encryption.xml", enc.as_bytes().to_vec()));
    }
    zip(&entries)
}
