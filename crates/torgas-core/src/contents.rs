//! Chapitres contenus dans un volume de manga, retrouvés d'après le nom de ses pages.
//!
//! Les scans rangent souvent les pages par chapitre : un dossier par chapitre
//! (`Chapitre 109/01.jpg`) ou un préfixe dans le nom (`109-00.jpg`, `c109_p01.png`).

// Numéros de chapitre lus tels quels dans les noms : les comparer exactement est voulu.
#![allow(clippy::float_cmp)]

use serde::{Deserialize, Serialize};

use crate::naming::parse_name;

/// Un chapitre d'un volume : son numéro et la page (à partir de 0) où il commence.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(test, derive(ts_rs::TS), ts(rename_all = "camelCase", optional_fields))]
pub struct VolumeChapter {
    /// Numéro du chapitre (`1050.5` possible).
    pub number: f64,
    /// Première page du chapitre dans le volume (à partir de 0).
    pub page: u32,
    /// Titre du chapitre, si le nom du dossier en donne un.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
}

/// Part minimale des pages dont le nom doit suivre le motif `chapitre-page`.
const PREFIX_SHARE: f64 = 0.8;

/// Chapitres d'un volume d'après les chemins de ses pages, dans l'ordre de lecture.
/// Vide si les noms ne disent rien des chapitres, ou s'ils n'en donnent qu'un seul.
pub fn chapters_from_pages(names: &[String]) -> Vec<VolumeChapter> {
    let chapters = by_folder(names).unwrap_or_else(|| by_prefix(names));
    if chapters.len() < 2 {
        Vec::new()
    } else {
        chapters
    }
}

fn page_index(index: usize) -> u32 {
    u32::try_from(index).unwrap_or(u32::MAX)
}

/// Un dossier par chapitre : chaque dossier doit nommer un chapitre (« Chapitre 109 », « c109 »,
/// « One Piece - Ch. 109 - Titre »). Les pages à la racine (couverture) précèdent le premier.
fn by_folder(names: &[String]) -> Option<Vec<VolumeChapter>> {
    let mut chapters: Vec<VolumeChapter> = Vec::new();
    let mut folders = 0;
    let mut last_folder: Option<&str> = None;
    for (index, name) in names.iter().enumerate() {
        let Some((folder, _)) = name.rsplit_once('/') else {
            continue;
        };
        if last_folder == Some(folder) {
            continue;
        }
        last_folder = Some(folder);
        folders += 1;
        let leaf = folder.rsplit('/').next().unwrap_or(folder);
        let (number, title) = folder_chapter(leaf)?;
        if chapters.last().is_some_and(|c| c.number == number) {
            continue;
        }
        chapters.push(VolumeChapter {
            number,
            page: page_index(index),
            title,
        });
    }
    (folders >= 2).then_some(chapters)
}

/// Chapitre nommé par un dossier : « Chapitre 21 - Le départ », « Ch. 21 », « c021 », ou un
/// nom complet (« One Piece - Chapitre 21 »).
fn folder_chapter(leaf: &str) -> Option<(f64, Option<String>)> {
    let lower = leaf.to_lowercase();
    let after_marker = ["chapitre", "chapter", "chap.", "chap", "ch.", "ch", "c"]
        .iter()
        .find_map(|marker| lower.strip_prefix(marker))
        .map(|rest| &leaf[leaf.len() - rest.len()..]);
    if let Some(rest) = after_marker {
        let rest = rest.trim_start();
        let end = rest
            .find(|c: char| !c.is_ascii_digit() && c != '.' && c != ',')
            .unwrap_or(rest.len());
        let number: f64 = rest[..end]
            .replace(',', ".")
            .trim_end_matches('.')
            .parse()
            .ok()?;
        let title = rest[end..]
            .trim_matches(|c: char| c.is_whitespace() || "-–—:.".contains(c))
            .to_owned();
        return Some((number, (!title.is_empty()).then_some(title)));
    }
    let info = parse_name(leaf)?;
    Some((info.chapter?, info.chapter_title))
}

/// Préfixe numérique : `109-00.jpg`, `109_01.jpg`, `c109-p02.jpg`, `ch109 03.png`. Il faut que
/// la plupart des pages le suivent et que les numéros ne reculent jamais.
fn by_prefix(names: &[String]) -> Vec<VolumeChapter> {
    let parsed: Vec<Option<f64>> = names.iter().map(|name| prefix_chapter(name)).collect();
    let matching = parsed.iter().filter(|p| p.is_some()).count();
    #[allow(clippy::cast_precision_loss)]
    if names.is_empty() || (matching as f64) < PREFIX_SHARE * names.len() as f64 {
        return Vec::new();
    }
    let mut chapters: Vec<VolumeChapter> = Vec::new();
    for (index, number) in parsed.iter().enumerate() {
        let Some(number) = *number else { continue };
        match chapters.last() {
            Some(last) if last.number == number => {}
            Some(last) if last.number > number => return Vec::new(),
            _ => chapters.push(VolumeChapter {
                number,
                page: page_index(index),
                title: None,
            }),
        }
    }
    chapters
}

/// Numéro de chapitre d'un nom de page `chapitre<sép>page` (`109-00`, `c109_p01`).
fn prefix_chapter(path: &str) -> Option<f64> {
    let file = path.rsplit('/').next().unwrap_or(path);
    let stem = file.rsplit_once('.').map_or(file, |(stem, _)| stem);
    let lower = stem.to_ascii_lowercase();
    let rest = ["chapter", "chap", "ch", "c"]
        .iter()
        .find_map(|marker| lower.strip_prefix(marker))
        .unwrap_or(&lower);
    let digits = rest.find(|c: char| !c.is_ascii_digit() && c != '.')?;
    let (number, tail) = rest.split_at(digits);
    if number.is_empty() || number.len() > 4 {
        return None;
    }
    let mut tail = tail.chars();
    if !matches!(tail.next(), Some('-' | '_' | ' ')) {
        return None;
    }
    let page: String = tail.collect();
    let page = page.strip_prefix('p').unwrap_or(&page);
    let page_digits = page.chars().take_while(char::is_ascii_digit).count();
    let suffix = &page[page_digits..];
    if page_digits == 0 || page_digits > 4 || suffix.len() > 1 {
        return None;
    }
    number.parse().ok().filter(|n: &f64| n.is_finite())
}

#[cfg(test)]
#[allow(clippy::assert_is_empty)]
mod tests {
    use super::*;

    fn names(list: &[&str]) -> Vec<String> {
        list.iter().map(|s| (*s).to_owned()).collect()
    }

    fn summary(chapters: &[VolumeChapter]) -> Vec<(f64, u32)> {
        chapters.iter().map(|c| (c.number, c.page)).collect()
    }

    #[test]
    fn chapters_from_page_prefixes() {
        // One Piece T013 : chapitres 109 à 117, pages `109-00.jpg`…
        let pages = names(&[
            "109-00.jpg",
            "109-01.jpg",
            "110-00.jpg",
            "110-01.jpg",
            "110-02a.jpg",
            "111-00.jpg",
        ]);
        assert_eq!(
            summary(&chapters_from_pages(&pages)),
            [(109.0, 0), (110.0, 2), (111.0, 5)]
        );
        let marked = names(&["c012_p01.png", "c012_p02.png", "c013_p01.png"]);
        assert_eq!(
            summary(&chapters_from_pages(&marked)),
            [(12.0, 0), (13.0, 2)]
        );
    }

    #[test]
    fn chapters_from_folders() {
        let pages = names(&[
            "cover.jpg",
            "Vol 3/Chapitre 21 - Le départ/01.jpg",
            "Vol 3/Chapitre 21 - Le départ/02.jpg",
            "Vol 3/Chapitre 22/01.jpg",
        ]);
        let chapters = chapters_from_pages(&pages);
        assert_eq!(summary(&chapters), [(21.0, 1), (22.0, 3)]);
        assert_eq!(chapters[0].title.as_deref(), Some("Le départ"));
    }

    #[test]
    fn plain_page_numbers_say_nothing() {
        assert!(chapters_from_pages(&names(&["001.jpg", "002.jpg", "003.jpg"])).is_empty());
        // Un seul dossier (le volume entier) : pas de chapitres.
        let one = names(&["One Piece T01/000.jpg", "One Piece T01/001.jpg"]);
        assert!(chapters_from_pages(&one).is_empty());
        // Pages de KCC : `one-piece-v0067-0126-kcc.jpg`.
        let kcc = names(&[
            "one-piece-v0067-0000-kcc.jpg",
            "one-piece-v0067-0001-kcc.jpg",
        ]);
        assert!(chapters_from_pages(&kcc).is_empty());
        // Un seul chapitre, ou des numéros qui reculent : rien.
        assert!(chapters_from_pages(&names(&["5-01.jpg", "5-02.jpg"])).is_empty());
        assert!(chapters_from_pages(&names(&["9-01.jpg", "3-01.jpg", "9-02.jpg"])).is_empty());
    }
}
