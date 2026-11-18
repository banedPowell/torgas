//! Petits utilitaires internes autour du crate `zip`.

use std::io::{Cursor, Read};

use zip::ZipArchive;
use zip::result::ZipError;

use crate::error::{CoreError, Result};

/// Archive ZIP lue entièrement en mémoire.
pub(crate) type MemArchive<B> = ZipArchive<Cursor<B>>;

/// Taille maximale d'une entrée décompressée (protection contre les bombes ZIP).
pub(crate) const MAX_ENTRY_BYTES: u64 = 256 * 1024 * 1024;

/// Ouvre une archive ZIP en mémoire ; une archive illisible devient `Unsupported`.
pub(crate) fn open<B: AsRef<[u8]>>(bytes: B) -> Result<MemArchive<B>> {
    ZipArchive::new(Cursor::new(bytes)).map_err(|err| match err {
        ZipError::InvalidArchive(_) | ZipError::UnsupportedArchive(_) => {
            CoreError::Unsupported(format!("pas une archive ZIP ({err})"))
        }
        other => CoreError::Zip(other),
    })
}

/// Lit l'entrée d'index `index` en entier.
pub(crate) fn read_index<B: AsRef<[u8]>>(
    archive: &mut MemArchive<B>,
    index: usize,
) -> Result<Vec<u8>> {
    let file = archive.by_index(index)?;
    let size = file.size();
    if size > MAX_ENTRY_BYTES {
        return Err(CoreError::Unsupported(format!(
            "entrée de {size} octets, au-delà de la limite de {MAX_ENTRY_BYTES}"
        )));
    }
    let mut out = Vec::with_capacity(usize::try_from(size).unwrap_or(0));
    file.take(MAX_ENTRY_BYTES + 1).read_to_end(&mut out)?;
    if out.len() as u64 > MAX_ENTRY_BYTES {
        return Err(CoreError::Unsupported(
            "entrée décompressée trop volumineuse".to_owned(),
        ));
    }
    Ok(out)
}

/// Lit l'entrée nommée `name`, ou `None` si elle n'existe pas.
pub(crate) fn read_name<B: AsRef<[u8]>>(
    archive: &mut MemArchive<B>,
    name: &str,
) -> Result<Option<Vec<u8>>> {
    match archive.index_for_name(name) {
        Some(index) => read_index(archive, index).map(Some),
        None => Ok(None),
    }
}

/// Lit l'entrée nommée `name` comme texte UTF-8 (BOM retiré).
pub(crate) fn read_text<B: AsRef<[u8]>>(
    archive: &mut MemArchive<B>,
    name: &str,
) -> Result<Option<String>> {
    let Some(bytes) = read_name(archive, name)? else {
        return Ok(None);
    };
    let text = String::from_utf8(bytes)
        .map_err(|_| CoreError::xml(name, "le document n'est pas en UTF-8"))?;
    Ok(Some(
        text.strip_prefix('\u{feff}')
            .map(str::to_owned)
            .unwrap_or(text),
    ))
}
