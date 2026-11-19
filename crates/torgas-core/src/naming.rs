//! Déduction de la série, du volume et du chapitre depuis un nom de fichier.

/// Extensions retirées avant l'analyse du nom.
const KNOWN_EXTENSIONS: [&str; 7] = ["cbz", "cbr", "cb7", "zip", "epub", "pdf", "rar"];

/// Marqueurs de volume reconnus avant le numéro, du plus long au plus court
/// (comparaison insensible à la casse).
const VOLUME_MARKERS: [&str; 7] = ["volume", "tome", "vol.", "vol", "t.", "v", "t"];

/// Séparateur des noms de fichiers des bibliothèques en ligne (Anna's Archive, Library
/// Genesis) : `Titre -- Auteur -- Année -- Éditeur -- isbn13 … -- empreinte -- Source`.
const SEGMENT_SEPARATOR: &str = " -- ";

/// Marqueurs de chapitre reconnus avant le numéro, du plus long au plus court
/// (comparaison insensible à la casse). `#` désigne un numéro de parution, donc un chapitre.
const CHAPTER_MARKERS: [&str; 8] = [
    "chapitre", "chapter", "chap.", "chap", "ch.", "ch", "c", "#",
];

/// Séparateurs retirés autour du titre de série et du titre de chapitre.
const SEPARATORS: [char; 6] = ['-', '–', '—', ',', ':', '.'];

/// Ce qu'un nom de fichier dit d'une œuvre de série.
#[derive(Debug, Clone, PartialEq)]
pub struct NameInfo {
    /// Titre de la série.
    pub series_title: String,
    /// Numéro de volume.
    pub volume: Option<f64>,
    /// Numéro de chapitre.
    pub chapter: Option<f64>,
    /// Titre du chapitre (texte qui suit son numéro).
    pub chapter_title: Option<String>,
}

/// Nom de fichier sans dossier ni extension connue, `_` remplacés par des espaces. Un nom
/// en segments ` -- ` (Anna's Archive) est réduit à son premier segment, le titre.
///
/// Sert aussi de titre par défaut quand le fichier n'en fournit pas.
pub fn clean_stem(filename: &str) -> String {
    let stem = full_stem(filename);
    match stem.split_once(SEGMENT_SEPARATOR) {
        Some((title, _)) if !title.trim().is_empty() => title.trim().to_owned(),
        _ => stem,
    }
}

/// Auteur d'un nom en segments ` -- ` (Anna's Archive) : le deuxième segment, s'il y en a
/// au moins trois (`Titre -- Auteur -- Année …`).
pub fn author_from_name(filename: &str) -> Option<String> {
    let stem = full_stem(filename);
    let segments: Vec<&str> = stem.split(SEGMENT_SEPARATOR).map(str::trim).collect();
    match segments.as_slice() {
        [_, author, _, ..] if !author.is_empty() => Some((*author).to_owned()),
        _ => None,
    }
}

/// Nom de fichier sans dossier ni extension connue, `_` remplacés par des espaces.
fn full_stem(filename: &str) -> String {
    let base = filename.rsplit(['/', '\\']).next().unwrap_or(filename);
    let stem = match base.rsplit_once('.') {
        Some((stem, ext))
            if !stem.is_empty()
                && KNOWN_EXTENSIONS
                    .iter()
                    .any(|known| known.eq_ignore_ascii_case(ext)) =>
        {
            stem
        }
        _ => base,
    };
    stem.replace('_', " ").trim().to_owned()
}

/// Retire les groupes entre parenthèses ou crochets en fin de nom
/// (`Titre v03 (2021) [Digital]` → `Titre v03`).
fn strip_trailing_groups(mut text: &str) -> &str {
    loop {
        let trimmed = text.trim_end();
        let open = match trimmed.chars().last() {
            Some(')') => '(',
            Some(']') => '[',
            _ => return trimmed,
        };
        match trimmed.rfind(open) {
            Some(start) if start > 0 => text = &trimmed[..start],
            _ => return trimmed,
        }
    }
}

/// Retire les groupes entre crochets en début de nom (`[Team] Titre c12` → `Titre c12`).
fn strip_leading_groups(mut text: &str) -> &str {
    loop {
        let trimmed = text.trim_start();
        match trimmed
            .strip_prefix('[')
            .and_then(|rest| rest.split_once(']'))
        {
            Some((_, rest)) if !rest.trim().is_empty() => text = rest,
            _ => return trimmed,
        }
    }
}

/// Nom de fichier sans extension ni groupes `[…]` en tête et `(…)`/`[…]` en fin.
fn core_text(filename: &str) -> String {
    let stem = clean_stem(filename);
    strip_trailing_groups(strip_leading_groups(&stem)).to_owned()
}

fn trim_separators(text: &str) -> &str {
    text.trim_matches(|c: char| c.is_whitespace() || SEPARATORS.contains(&c))
}

/// Sépare le numéro final : renvoie (texte avant, numéro).
fn split_trailing_number(text: &str) -> Option<(&str, f64)> {
    let bytes = text.as_bytes();
    let mut start = bytes.len();
    let mut seen_separator = false;
    while start > 0 {
        let byte = bytes[start - 1];
        if byte.is_ascii_digit() {
            start -= 1;
        } else if (byte == b'.' || byte == b',')
            && !seen_separator
            && start < bytes.len()
            && start >= 2
            && bytes[start - 2].is_ascii_digit()
        {
            seen_separator = true;
            start -= 1;
        } else {
            break;
        }
    }
    if start == bytes.len() {
        return None;
    }
    let number: f64 = text[start..].replace(',', ".").parse().ok()?;
    Some((&text[..start], number))
}

/// Si `prefix` se termine par un marqueur de volume précédé d'une frontière
/// (début, espace, tiret…), renvoie le texte avant le marqueur.
fn strip_marker(prefix: &str) -> Option<&str> {
    let bytes = prefix.as_bytes();
    VOLUME_MARKERS.iter().find_map(|marker| {
        let cut = bytes.len().checked_sub(marker.len())?;
        if !bytes[cut..].eq_ignore_ascii_case(marker.as_bytes()) {
            return None;
        }
        let boundary = cut == 0 || matches!(bytes[cut - 1], b' ' | b'-' | b'.' | b'(' | b'[');
        // Le marqueur est ASCII : `cut` tombe sur une frontière de caractère.
        boundary.then(|| &prefix[..cut])
    })
}

/// Déduit `(titre de la série, volume)` depuis un nom de fichier.
///
/// Formes reconnues : `Titre v03.cbz`, `Titre - Tome 3.cbz`, `Titre T03`,
/// `Titre Vol. 3`, `Titre 003.cbz`, avec d'éventuels groupes `[…]` en tête et
/// `(…)`/`[…]` en fin de nom. Renvoie `None` si aucun volume n'est trouvé ou si
/// le titre restant est vide. `Titre #3` désigne un chapitre ([`parse_chapter`]).
pub fn parse_volume(filename: &str) -> Option<(String, f64)> {
    let text = core_text(filename);
    let (before, volume) = split_trailing_number(&text)?;
    let prefix = before.trim_end();

    let title = match strip_marker(prefix) {
        Some(title) => title,
        // Numéro nu : il doit être séparé du titre (`Titre 003`, pas `Catch22`).
        None if prefix.len() < before.len() || prefix.ends_with('-') => prefix,
        None => return None,
    };
    let title = title.trim_end_matches(|c: char| c.is_whitespace() || SEPARATORS.contains(&c));
    (!title.is_empty()).then(|| (title.to_owned(), volume))
}

/// Volume marqué explicitement en fin de `prefix` (`Titre Vol.105`) : renvoie (titre, volume).
/// Un numéro nu n'est pas pris pour un volume (`Kaiju No. 8 - Chapitre 12`).
fn trailing_marked_volume(prefix: &str) -> Option<(&str, f64)> {
    let (before, volume) = split_trailing_number(prefix)?;
    let title = trim_separators(strip_marker(before.trim_end())?);
    (!title.is_empty()).then_some((title, volume))
}

/// Lit un numéro (`1050`, `1050.5`, `12,5`) au début de `text` : renvoie (numéro, octets lus).
fn leading_number(text: &str) -> Option<(f64, usize)> {
    let bytes = text.as_bytes();
    let mut end = bytes.iter().take_while(|b| b.is_ascii_digit()).count();
    if end == 0 {
        return None;
    }
    if matches!(bytes.get(end), Some(b'.' | b','))
        && bytes.get(end + 1).is_some_and(u8::is_ascii_digit)
    {
        end += 1 + bytes[end + 1..]
            .iter()
            .take_while(|b| b.is_ascii_digit())
            .count();
    }
    let number: f64 = text[..end].replace(',', ".").parse().ok()?;
    Some((number, end))
}

/// Si un marqueur de chapitre suivi d'un numéro commence à l'octet `at` de `text`, renvoie
/// (numéro, fin du numéro).
fn chapter_at(text: &str, at: usize) -> Option<(f64, usize)> {
    let bytes = text.as_bytes();
    CHAPTER_MARKERS.iter().find_map(|marker| {
        let end = at + marker.len();
        if !bytes.get(at..end)?.eq_ignore_ascii_case(marker.as_bytes()) {
            return None;
        }
        // `c1050` : le numéro suit la lettre ; les autres marqueurs admettent des espaces.
        let gap = if *marker == "c" {
            0
        } else {
            bytes[end..].iter().take_while(|b| **b == b' ').count()
        };
        let (number, len) = leading_number(&text[end + gap..])?;
        let stop = end + gap + len;
        // Le numéro termine le mot : `c12v` ou `Ch.12a` ne sont pas des chapitres.
        let ends_word = bytes.get(stop).is_none_or(|b| !b.is_ascii_alphanumeric());
        ends_word.then_some((number, stop))
    })
}

/// Déduit la série, le chapitre et son éventuel volume depuis un nom de fichier.
///
/// Formes reconnues : `Titre - Chapitre 1050`, `Titre Chapter 12`, `Titre Ch.1050`,
/// `Titre c1050`, `Titre #1050`, numéros décimaux (`1050.5`), volume marqué avant le
/// chapitre (`Titre Vol.105 Ch.1050`, `Titre v105 c1050`) et titre du chapitre après son
/// numéro (`Titre - Chapitre 1050 - Le titre`). Renvoie `None` sans chapitre ou sans titre
/// de série.
pub fn parse_chapter(filename: &str) -> Option<NameInfo> {
    let text = core_text(filename);
    let bytes = text.as_bytes();
    (1..bytes.len()).find_map(|at| {
        if !matches!(bytes[at - 1], b' ' | b'-' | b'.' | b'(' | b'[') {
            return None;
        }
        let (chapter, stop) = chapter_at(&text, at)?;
        let prefix = trim_separators(&text[..at]);
        let (series_title, volume) = match trailing_marked_volume(prefix) {
            Some((title, volume)) => (title, Some(volume)),
            None => (prefix, None),
        };
        if series_title.is_empty() {
            return None;
        }
        let rest = trim_separators(&text[stop..]);
        Some(NameInfo {
            series_title: series_title.to_owned(),
            volume,
            chapter: Some(chapter),
            chapter_title: (!rest.is_empty()).then(|| rest.to_owned()),
        })
    })
}

/// Série et chapitre d'un nom de fichier ([`parse_chapter`]), à défaut série et volume
/// ([`parse_volume`]).
pub fn parse_name(filename: &str) -> Option<NameInfo> {
    parse_chapter(filename).or_else(|| {
        parse_volume(filename)
            // « Chapitre 1201.cbz » : un chapitre seul, sans série connue, pas la série
            // « Chapitre » au volume 1201.
            .filter(|(series_title, _)| !is_chapter_word(series_title))
            .map(|(series_title, volume)| NameInfo {
                series_title,
                volume: Some(volume),
                chapter: None,
                chapter_title: None,
            })
    })
}

/// Le texte n'est qu'un marqueur de chapitre (« Chapitre », « Ch. »…).
fn is_chapter_word(text: &str) -> bool {
    let word = fold(trim_separators(text.trim()));
    CHAPTER_MARKERS
        .iter()
        .any(|marker| marker.trim_end_matches('.') == word.trim_end_matches('.'))
}

/// Forme canonique d'un titre de série, appliquée à toutes les sources (nom de fichier,
/// `ComicInfo.xml`, métadonnées EPUB) pour qu'un EPUB et un CBZ de la même série se
/// retrouvent : `_` et espaces multiples ramenés à une espace, apostrophes typographiques
/// droites, séparateurs retirés aux bords. La casse est comparée à part (`COLLATE NOCASE`).
pub fn normalize_series_title(title: &str) -> String {
    let text = title.replace('_', " ").replace(['’', 'ʼ', '‘'], "'");
    let collapsed = text.split_whitespace().collect::<Vec<_>>().join(" ");
    trim_separators(&collapsed).to_owned()
}

/// Minuscules sans accents (accents courants du français, de l'espagnol, de l'allemand).
pub fn fold(text: &str) -> String {
    text.to_lowercase()
        .chars()
        .map(|c| match c {
            'à' | 'â' | 'ä' | 'á' | 'ã' => 'a',
            'é' | 'è' | 'ê' | 'ë' => 'e',
            'î' | 'ï' | 'í' | 'ì' => 'i',
            'ô' | 'ö' | 'ó' | 'ò' | 'õ' => 'o',
            'û' | 'ü' | 'ù' | 'ú' => 'u',
            'ç' => 'c',
            'ñ' => 'n',
            'ÿ' => 'y',
            other => other,
        })
        .collect()
}

/// Clé de rapprochement des séries : deux titres de même clé désignent la même série, quelle
/// que soit la source (nom de fichier, `ComicInfo.xml`, OPF). Insensible à la casse, aux
/// accents et à la ponctuation (`One Piece`, `ONE PIECE.`, `One-Piece` donnent `one piece`).
pub fn series_key(title: &str) -> String {
    fold(title)
        .split(|c: char| !c.is_alphanumeric())
        .filter(|word| !word.is_empty())
        .collect::<Vec<_>>()
        .join(" ")
}

#[cfg(test)]
#[allow(clippy::float_cmp)]
mod tests {
    use super::*;

    #[test]
    fn lone_chapter_marker_is_not_a_series() {
        assert_eq!(parse_name("Chapitre 1201.cbz"), None);
        assert_eq!(parse_name("Chapter 12.cbz"), None);
        let info = parse_name("One Piece - Chapitre 1201.cbz").unwrap();
        assert_eq!(info.series_title, "One Piece");
        assert_eq!(info.chapter, Some(1201.0));
    }

    fn parsed(name: &str) -> Option<(String, f64)> {
        parse_volume(name)
    }

    fn expect(name: &str, title: &str, volume: f64) {
        assert_eq!(parsed(name), Some((title.to_owned(), volume)), "{name}");
    }

    #[test]
    fn recognised_forms() {
        expect("Titre v03.cbz", "Titre", 3.0);
        expect("Titre - Tome 3.cbz", "Titre", 3.0);
        expect("Titre T03", "Titre", 3.0);
        expect("Titre Vol. 3", "Titre", 3.0);
        expect("Titre Vol.3.cbz", "Titre", 3.0);
        expect("Titre 003.cbz", "Titre", 3.0);
        expect("Titre volume 12.epub", "Titre", 12.0);
        expect("[Scan] Titre v04.cbz", "Titre", 4.0);
    }

    #[test]
    fn handles_paths_underscores_and_groups() {
        expect("mangas/One_Piece_v105.cbz", "One Piece", 105.0);
        expect(
            "L'Attaque des Titans - T34 (2021) [Digital].cbz",
            "L'Attaque des Titans",
            34.0,
        );
        expect("Été tome 2.cbz", "Été", 2.0);
        expect("Série 1,5.cbz", "Série", 1.5);
    }

    #[test]
    fn rejects_names_without_volume() {
        assert_eq!(parsed("Titre.cbz"), None);
        assert_eq!(parsed("Catch22.cbz"), None);
        assert_eq!(parsed("v03.cbz"), None);
        assert_eq!(parsed("003.cbz"), None);
        assert_eq!(parsed(""), None);
        // `#3` est un numéro de chapitre, pas de volume.
        assert_eq!(parsed("Titre #3"), None);
    }

    #[test]
    fn marker_needs_a_boundary() {
        // « Test 3 » : le « t » final de « Test » n'est pas un marqueur.
        expect("Test 3.cbz", "Test", 3.0);
        expect("Bat 2", "Bat", 2.0);
    }

    type Chapter = (String, Option<f64>, f64, Option<String>);

    fn chapter(name: &str) -> Option<Chapter> {
        parse_chapter(name).map(|info| {
            (
                info.series_title,
                info.volume,
                info.chapter.unwrap(),
                info.chapter_title,
            )
        })
    }

    fn expect_chapter(name: &str, title: &str, number: f64) {
        assert_eq!(
            chapter(name),
            Some((title.to_owned(), None, number, None)),
            "{name}"
        );
    }

    #[test]
    fn chapter_forms() {
        expect_chapter("One Piece - Chapitre 1050.cbz", "One Piece", 1050.0);
        expect_chapter("One Piece Ch.1050.cbz", "One Piece", 1050.0);
        expect_chapter("One Piece ch. 1050", "One Piece", 1050.0);
        expect_chapter("One Piece c1050.cbz", "One Piece", 1050.0);
        expect_chapter("One Piece #1050.cbz", "One Piece", 1050.0);
        expect_chapter("One Piece - Chapter 12", "One Piece", 12.0);
        expect_chapter("One Piece Chap 7", "One Piece", 7.0);
        expect_chapter("One_Piece_c1050.5.cbz", "One Piece", 1050.5);
        expect_chapter("Dr. Stone - Ch.12,5", "Dr. Stone", 12.5);
        expect_chapter("[Team] Berserk c001 (2021) [HQ].cbz", "Berserk", 1.0);
    }

    #[test]
    fn chapter_with_volume_and_title() {
        assert_eq!(
            chapter("One Piece Vol.105 Ch.1050 - Honneur.cbz"),
            Some((
                "One Piece".to_owned(),
                Some(105.0),
                1050.0,
                Some("Honneur".to_owned())
            ))
        );
        assert_eq!(
            chapter("Berserk v01 c003.cbz"),
            Some(("Berserk".to_owned(), Some(1.0), 3.0, None))
        );
        assert_eq!(
            chapter("Saga - Chapitre 3 : Le départ"),
            Some(("Saga".to_owned(), None, 3.0, Some("Le départ".to_owned())))
        );
        // Un numéro nu avant le chapitre reste dans le titre de la série.
        expect_chapter("Kaiju No. 8 - Chapitre 12", "Kaiju No. 8", 12.0);
    }

    #[test]
    fn not_chapters() {
        assert_eq!(chapter("Titre v03.cbz"), None);
        assert_eq!(chapter("Chapitre 12.cbz"), None, "sans titre de série");
        assert_eq!(chapter("Bac 2.cbz"), None);
        assert_eq!(chapter("Le Ciel 3.cbz"), None);
        assert_eq!(chapter("Titre c12v.cbz"), None);
        assert_eq!(chapter("Catch22.cbz"), None);
        assert_eq!(chapter("Chapter Black.cbz"), None);
    }

    #[test]
    fn parse_name_prefers_chapters() {
        let info = parse_name("Titre #3.cbz").unwrap();
        assert_eq!(info.chapter, Some(3.0));
        assert_eq!(info.volume, None);
        let info = parse_name("Titre T03.cbz").unwrap();
        assert_eq!(info.chapter, None);
        assert_eq!(info.volume, Some(3.0));
        assert_eq!(parse_name("Titre.cbz"), None);
    }

    const ANNA_CBZ: &str = "One Piece T013 -- Eiichiro Oda -- 2014 -- Glénat Manga -- \
        isbn13 9782331011634 -- 084d0c76c3d6157912abf8e80f0c6bca -- Anna’s Archive.cbz";
    const ANNA_EPUB: &str = "One Piece, Vol_ 67 67 -- Oda, Eiichiro -- One Piece #67, 2013 -- \
        VIZ Media LLC -- 581d0c76c3d6157912abf8e80f0c6bca -- Anna’s Archive.epub";

    #[test]
    fn annas_archive_names_keep_the_first_segment() {
        assert_eq!(clean_stem(ANNA_CBZ), "One Piece T013");
        expect(ANNA_CBZ, "One Piece", 13.0);
        assert_eq!(author_from_name(ANNA_CBZ).as_deref(), Some("Eiichiro Oda"));
        // Le `#67` du troisième segment n'en fait pas un chapitre.
        assert_eq!(parse_name(ANNA_EPUB).unwrap().chapter, None);
        assert_eq!(
            author_from_name(ANNA_EPUB).as_deref(),
            Some("Oda, Eiichiro")
        );
        assert_eq!(author_from_name("Titre -- Sous-titre.cbz"), None);
        assert_eq!(author_from_name("One Piece v01.cbz"), None);
    }

    #[test]
    fn tome_forms() {
        expect("One Piece Tome 13.cbz", "One Piece", 13.0);
        expect("One Piece T.13.cbz", "One Piece", 13.0);
        expect("One Piece T13", "One Piece", 13.0);
        expect("One Piece, Vol. 67", "One Piece", 67.0);
    }

    #[test]
    fn series_keys_ignore_case_accents_and_punctuation() {
        let key = series_key("One Piece");
        for title in [
            "ONE PIECE",
            "One Piece.",
            "One-Piece",
            " one  piece ",
            "One Piece,",
        ] {
            assert_eq!(series_key(title), key, "{title}");
        }
        assert_eq!(series_key("Été"), series_key("ETE"));
        assert_eq!(series_key("L’Attaque des Titans"), "l attaque des titans");
        assert_ne!(series_key("One Piece"), series_key("One Punch"));
    }

    #[test]
    fn series_titles_are_normalized() {
        assert_eq!(
            normalize_series_title("  L’Attaque_des   Titans - "),
            "L'Attaque des Titans"
        );
        assert_eq!(normalize_series_title("One Piece"), "One Piece");
        assert_eq!(normalize_series_title(" - "), "");
    }

    #[test]
    fn stem_is_cleaned() {
        assert_eq!(clean_stem("a/b/Mon_Livre.EPUB"), "Mon Livre");
        assert_eq!(clean_stem("Dr. Stone"), "Dr. Stone");
        assert_eq!(clean_stem(".cbz"), ".cbz");
    }
}
