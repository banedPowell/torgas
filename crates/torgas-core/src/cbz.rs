//! Lecture des archives de bande dessinée (CBZ).

use serde::{Deserialize, Serialize};

use crate::comicinfo::{self, COMIC_INFO, ComicInfo};
use crate::error::{CoreError, Result};
use crate::sort::natural_cmp;
use crate::zipread::{self, MemArchive};

/// Une image extraite d'une archive (page de CBZ, couverture, miniature).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(test, derive(ts_rs::TS))]
pub struct Page {
    /// Type MIME de l'image (`image/jpeg`, `image/webp`…).
    pub mime: String,
    /// Contenu brut de l'image. Sérialisé en octets (`Uint8Array` côté WebAssembly).
    #[serde(with = "bytes")]
    #[cfg_attr(test, ts(type = "Uint8Array"))]
    pub bytes: Vec<u8>,
}

/// Sérialisation compacte des octets : `serialize_bytes` donne un `Uint8Array`
/// avec `serde-wasm-bindgen` au lieu d'un tableau de nombres.
mod bytes {
    use serde::{Deserialize, Deserializer, Serializer};

    pub(super) fn serialize<S: Serializer>(bytes: &[u8], serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_bytes(bytes)
    }

    pub(super) fn deserialize<'de, D: Deserializer<'de>>(
        deserializer: D,
    ) -> Result<Vec<u8>, D::Error> {
        Vec::<u8>::deserialize(deserializer)
    }
}

/// Renvoie le type MIME d'une image d'après l'extension de `name`, ou `None`
/// si ce n'est pas une image de page prise en charge.
pub fn image_mime(name: &str) -> Option<&'static str> {
    let (_, ext) = name.rsplit_once('.')?;
    let mime = match ext.to_ascii_lowercase().as_str() {
        "jpg" | "jpeg" => "image/jpeg",
        "png" => "image/png",
        "webp" => "image/webp",
        "gif" => "image/gif",
        "avif" => "image/avif",
        _ => return None,
    };
    Some(mime)
}

/// Indique si un chemin d'archive doit être ignoré : ressources macOS
/// (`__MACOSX`) ou fichier/dossier caché (commençant par `.`).
fn is_ignored(path: &str) -> bool {
    path.split(['/', '\\'])
        .any(|part| part == "__MACOSX" || part.starts_with('.'))
}

#[derive(Debug, Clone)]
struct PageEntry {
    name: String,
    index: usize,
    mime: &'static str,
}

/// Archive CBZ ouverte en mémoire, avec ses pages indexées et triées.
///
/// Les pages sont les images (jpg, jpeg, png, webp, gif, avif) de l'archive,
/// dossiers compris, triées par [`natural_cmp`] sur leur chemin complet.
/// Les entrées `__MACOSX`, les fichiers cachés et les autres fichiers
/// (`ComicInfo.xml`, `.txt`…) sont ignorés.
pub struct CbzArchive<B = Vec<u8>> {
    archive: MemArchive<B>,
    pages: Vec<PageEntry>,
    /// Index de `ComicInfo.xml` (à la racine de préférence).
    comic_info: Option<usize>,
}

impl<B: AsRef<[u8]>> CbzArchive<B> {
    /// Ouvre une archive CBZ depuis son contenu.
    ///
    /// Une archive sans aucune image est acceptée (`page_count() == 0`) : c'est
    /// à l'appelant de décider s'il s'agit d'une erreur.
    pub fn open(bytes: B) -> Result<Self> {
        let archive = zipread::open(bytes)?;
        let mut pages = Vec::new();
        let mut comic_info: Option<(usize, bool)> = None;
        for index in 0..archive.len() {
            let Some(name) = archive.name_for_index(index) else {
                continue;
            };
            let name = name?;
            if name.ends_with('/') || is_ignored(&name) {
                continue;
            }
            let file_name = name.rsplit('/').next().unwrap_or(&name);
            if file_name.eq_ignore_ascii_case(COMIC_INFO) {
                let at_root = file_name.len() == name.len();
                if comic_info.is_none_or(|(_, root)| at_root && !root) {
                    comic_info = Some((index, at_root));
                }
                continue;
            }
            if let Some(mime) = image_mime(&name) {
                pages.push(PageEntry {
                    name: name.into_owned(),
                    index,
                    mime,
                });
            }
        }
        pages.sort_by(|a, b| natural_cmp(&a.name, &b.name));
        Ok(Self {
            archive,
            pages,
            comic_info: comic_info.map(|(index, _)| index),
        })
    }

    /// Métadonnées `ComicInfo.xml`, si l'archive en contient une lisible.
    pub fn comic_info(&mut self) -> Option<ComicInfo> {
        let bytes = zipread::read_index(&mut self.archive, self.comic_info?).ok()?;
        let text = String::from_utf8_lossy(&bytes);
        comicinfo::parse(text.trim_start_matches('\u{feff}'))
    }

    /// Nombre de pages (images) de l'archive.
    pub fn page_count(&self) -> usize {
        self.pages.len()
    }

    /// Chemins des pages dans l'archive, dans l'ordre de lecture.
    pub fn page_names(&self) -> Vec<String> {
        self.pages.iter().map(|page| page.name.clone()).collect()
    }

    /// Extrait la page `n` (à partir de 0).
    pub fn page(&mut self, n: usize) -> Result<Page> {
        let entry = self.pages.get(n).ok_or(CoreError::PageOutOfRange {
            index: n,
            count: self.pages.len(),
        })?;
        let (index, mime) = (entry.index, entry.mime);
        let bytes = zipread::read_index(&mut self.archive, index)?;
        Ok(Page {
            mime: mime.to_owned(),
            bytes,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::fixtures;

    #[test]
    fn indexes_and_sorts_pages_naturally() {
        let bytes = fixtures::cbz_p1_to_p12();
        let mut cbz = CbzArchive::open(bytes).unwrap();
        assert_eq!(cbz.page_count(), 12);
        let names = cbz.page_names();
        assert_eq!(names[0], "p1.jpg");
        assert_eq!(names[1], "p2.jpg");
        assert_eq!(names[9], "p10.jpg");
        assert_eq!(names[11], "p12.jpg");
        let page = cbz.page(0).unwrap();
        assert_eq!(page.mime, "image/jpeg");
        assert_eq!(page.bytes, fixtures::jpeg_bytes(1));
    }

    #[test]
    fn ignores_macosx_hidden_and_non_images() {
        let bytes = fixtures::cbz_with_folders();
        let cbz = CbzArchive::open(bytes.as_slice()).unwrap();
        assert_eq!(
            cbz.page_names(),
            [
                "Chapitre 1/001.png",
                "Chapitre 1/002.webp",
                "Chapitre 2/001.gif",
                "Chapitre 10/001.avif",
            ]
        );
    }

    #[test]
    fn page_out_of_range() {
        let mut cbz = CbzArchive::open(fixtures::cbz_p1_to_p12()).unwrap();
        let err = cbz.page(12).unwrap_err();
        assert!(matches!(
            err,
            CoreError::PageOutOfRange {
                index: 12,
                count: 12
            }
        ));
    }

    #[test]
    fn non_zip_is_unsupported() {
        let err = CbzArchive::open(b"pas un zip".as_slice()).err().unwrap();
        assert!(matches!(err, CoreError::Unsupported(_)));
    }

    #[test]
    fn mime_by_extension() {
        assert_eq!(image_mime("a/B.JPEG"), Some("image/jpeg"));
        assert_eq!(image_mime("x.avif"), Some("image/avif"));
        assert_eq!(image_mime("ComicInfo.xml"), None);
        assert_eq!(image_mime("noext"), None);
    }

    #[test]
    fn page_serializes_as_camel_case() {
        let page = Page {
            mime: "image/png".to_owned(),
            bytes: vec![1, 2],
        };
        let json = serde_json::to_string(&page).unwrap();
        assert_eq!(json, r#"{"mime":"image/png","bytes":[1,2]}"#);
    }
}
