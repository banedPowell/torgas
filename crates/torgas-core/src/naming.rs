//! Déduction de la série et du volume depuis un nom de fichier.

/// Extensions retirées avant l'analyse du nom.
const KNOWN_EXTENSIONS: [&str; 7] = ["cbz", "cbr", "cb7", "zip", "epub", "pdf", "rar"];

/// Marqueurs de volume reconnus avant le numéro, du plus long au plus court
/// (comparaison insensible à la casse).
const VOLUME_MARKERS: [&str; 6] = ["volume", "tome", "vol.", "vol", "v", "t"];

/// Nom de fichier sans dossier ni extension connue, `_` remplacés par des espaces.
///
/// Sert aussi de titre par défaut quand le fichier n'en fournit pas.
pub fn clean_stem(filename: &str) -> String {
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
    if let Some(rest) = prefix.strip_suffix('#') {
        return Some(rest);
    }
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
/// `Titre Vol. 3`, `Titre #3`, `Titre 003.cbz`, avec d'éventuels groupes
/// `(…)`/`[…]` en fin de nom. Renvoie `None` si aucun volume n'est trouvé
/// ou si le titre restant est vide.
pub fn parse_volume(filename: &str) -> Option<(String, f64)> {
    let stem = clean_stem(filename);
    let text = strip_trailing_groups(&stem);
    let (before, volume) = split_trailing_number(text)?;
    let prefix = before.trim_end();

    let title = match strip_marker(prefix) {
        Some(title) => title,
        // Numéro nu : il doit être séparé du titre (`Titre 003`, pas `Catch22`).
        None if prefix.len() < before.len() || prefix.ends_with('-') => prefix,
        None => return None,
    };
    let title = title.trim_end_matches(|c: char| {
        c.is_whitespace() || matches!(c, '-' | '–' | '—' | ',' | ':' | '.')
    });
    (!title.is_empty()).then(|| (title.to_owned(), volume))
}

#[cfg(test)]
#[allow(clippy::float_cmp)]
mod tests {
    use super::*;

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
        expect("Titre #3", "Titre", 3.0);
        expect("Titre 003.cbz", "Titre", 3.0);
        expect("Titre volume 12.epub", "Titre", 12.0);
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
    }

    #[test]
    fn marker_needs_a_boundary() {
        // « Test 3 » : le « t » final de « Test » n'est pas un marqueur.
        expect("Test 3.cbz", "Test", 3.0);
        expect("Bat 2", "Bat", 2.0);
    }

    #[test]
    fn stem_is_cleaned() {
        assert_eq!(clean_stem("a/b/Mon_Livre.EPUB"), "Mon Livre");
        assert_eq!(clean_stem("Dr. Stone"), "Dr. Stone");
        assert_eq!(clean_stem(".cbz"), ".cbz");
    }
}
