//! Rangement des fichiers dans la bibliothèque sur disque (`~/Torgas/`).
//!
//! Un dossier par série (sinon par premier auteur, sinon « Sans auteur »), un nom
//! de fichier normalisé et sûr sur macOS, Windows et Linux.

use std::fs;
use std::io::Write as _;
use std::path::{Path, PathBuf};

use torgas_core::{Analysis, Format};

/// Longueur maximale (en caractères) d'un composant de chemin.
const MAX_COMPONENT_CHARS: usize = 120;

/// Dossier utilisé quand une œuvre n'a ni série ni auteur.
const NO_AUTHOR: &str = "Sans auteur";

/// Noms réservés par Windows, interdits comme nom de fichier ou de dossier.
const WINDOWS_RESERVED: [&str; 22] = [
    "CON", "PRN", "AUX", "NUL", "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8",
    "COM9", "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9",
];

/// Normalise un composant de chemin : caractères interdits remplacés, espaces
/// répétés réduits, points et espaces retirés aux extrémités, longueur bornée.
/// Renvoie `fallback` si rien d'utilisable ne reste.
pub fn sanitize_component(raw: &str, fallback: &str) -> String {
    let mut out = String::with_capacity(raw.len());
    let mut last_space = true;
    for ch in raw.chars() {
        let ch = match ch {
            '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '-',
            c if c.is_control() || c.is_whitespace() => ' ',
            c => c,
        };
        if ch == ' ' {
            if !last_space {
                out.push(' ');
            }
            last_space = true;
        } else {
            out.push(ch);
            last_space = false;
        }
    }
    let trimmed: String = out
        .trim_matches(|c: char| c == '.' || c == ' ')
        .chars()
        .take(MAX_COMPONENT_CHARS)
        .collect();
    let trimmed = trimmed.trim_end_matches([' ', '.']).to_owned();
    let upper = trimmed
        .split('.')
        .next()
        .unwrap_or_default()
        .to_ascii_uppercase();
    if trimmed.is_empty() || WINDOWS_RESERVED.contains(&upper.as_str()) {
        fallback.to_owned()
    } else {
        trimmed
    }
}

/// Dossier (relatif à la bibliothèque) où ranger l'œuvre analysée.
pub fn folder_for(analysis: &Analysis) -> String {
    let source = analysis
        .series_title
        .as_deref()
        .filter(|title| !title.trim().is_empty())
        .or_else(|| {
            analysis
                .authors
                .iter()
                .map(String::as_str)
                .find(|author| !author.trim().is_empty())
        })
        .unwrap_or(NO_AUTHOR);
    sanitize_component(source, NO_AUTHOR)
}

/// Nom de fichier normalisé, avec l'extension du format détecté.
pub fn file_name_for(analysis: &Analysis) -> String {
    let stem = sanitize_component(&analysis.title, "Sans titre");
    let ext = match analysis.format {
        Format::Epub => "epub",
        Format::Cbz => "cbz",
    };
    format!("{stem}.{ext}")
}

/// Chemin libre dans `dir` pour `file_name` : ajoute ` (2)`, ` (3)`… si un
/// fichier du même nom existe déjà.
pub fn unique_path(dir: &Path, file_name: &str) -> PathBuf {
    let candidate = dir.join(file_name);
    if !candidate.exists() {
        return candidate;
    }
    let (stem, ext) = file_name
        .rsplit_once('.')
        .map_or((file_name, ""), |(stem, ext)| (stem, ext));
    (2..10_000u32)
        .map(|n| {
            if ext.is_empty() {
                dir.join(format!("{stem} ({n})"))
            } else {
                dir.join(format!("{stem} ({n}).{ext}"))
            }
        })
        .find(|path| !path.exists())
        .unwrap_or(candidate)
}

/// Copie le fichier dans la bibliothèque (écriture dans un fichier temporaire
/// puis renommage, pour ne jamais laisser de fichier tronqué).
pub fn store(library_dir: &Path, analysis: &Analysis, bytes: &[u8]) -> std::io::Result<PathBuf> {
    let dir = library_dir.join(folder_for(analysis));
    fs::create_dir_all(&dir)?;
    let target = unique_path(&dir, &file_name_for(analysis));
    write_atomic(&target, bytes)?;
    Ok(target)
}

/// Écrit `bytes` dans `path` via un fichier temporaire voisin puis un renommage.
pub fn write_atomic(path: &Path, bytes: &[u8]) -> std::io::Result<()> {
    let mut tmp = path.as_os_str().to_owned();
    tmp.push(".part");
    let tmp = PathBuf::from(tmp);
    let result = (|| {
        let mut file = fs::File::create(&tmp)?;
        file.write_all(bytes)?;
        file.sync_all()?;
        fs::rename(&tmp, path)
    })();
    if result.is_err() {
        let _ = fs::remove_file(&tmp);
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    fn analysis(title: &str, authors: &[&str], series: Option<&str>, format: Format) -> Analysis {
        Analysis {
            format,
            sha256: "0".repeat(64),
            size_bytes: 0,
            title: title.to_owned(),
            authors: authors.iter().map(|a| (*a).to_owned()).collect(),
            language: None,
            series_title: series.map(str::to_owned),
            volume: None,
            chapter: None,
            chapter_title: None,
            page_count: None,
            drm: false,
            cover: None,
        }
    }

    #[test]
    fn sanitizes_components() {
        assert_eq!(sanitize_component("  A/B: c?  ", "x"), "A-B- c-");
        assert_eq!(sanitize_component("Titre\n\tlong", "x"), "Titre long");
        assert_eq!(sanitize_component("...", "x"), "x");
        assert_eq!(sanitize_component("CON", "x"), "x");
        assert_eq!(sanitize_component("con.txt", "x"), "x");
        assert_eq!(sanitize_component("Ça été", "x"), "Ça été");
        assert_eq!(
            sanitize_component(&"é".repeat(300), "x").chars().count(),
            120
        );
    }

    #[test]
    fn picks_series_then_author_folder() {
        let a = analysis("T1", &["Hergé"], Some("Tintin"), Format::Cbz);
        assert_eq!(folder_for(&a), "Tintin");
        let a = analysis("Germinal", &["", "Émile Zola"], None, Format::Epub);
        assert_eq!(folder_for(&a), "Émile Zola");
        let a = analysis("X", &[], None, Format::Epub);
        assert_eq!(folder_for(&a), "Sans auteur");
        assert_eq!(file_name_for(&a), "X.epub");
    }

    #[test]
    fn stores_without_overwriting() {
        let dir = tempfile::tempdir().unwrap();
        let a = analysis("Livre", &["Auteur"], None, Format::Epub);
        let first = store(dir.path(), &a, b"un").unwrap();
        let second = store(dir.path(), &a, b"deux").unwrap();
        assert_eq!(first, dir.path().join("Auteur").join("Livre.epub"));
        assert_eq!(second, dir.path().join("Auteur").join("Livre (2).epub"));
        assert_eq!(fs::read(&first).unwrap(), b"un");
        assert_eq!(fs::read(&second).unwrap(), b"deux");
        assert!(!dir.path().join("Auteur").join("Livre.epub.part").exists());
    }
}
