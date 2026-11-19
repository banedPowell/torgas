//! Métadonnées `ComicInfo.xml` des archives CBZ (format de `ComicRack`, repris par Komga, Kavita…).

use crate::xml;

/// Nom de l'entrée (comparé sans casse).
pub(crate) const COMIC_INFO: &str = "ComicInfo.xml";

/// Champs de `ComicInfo.xml` utiles à l'import.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct ComicInfo {
    /// Série (`Series`).
    pub series: Option<String>,
    /// Volume (`Volume`) ; `-1` (inconnu) est ignoré.
    pub volume: Option<f64>,
    /// Numéro de parution (`Number`) : chapitre, ou volume s'il vaut `Volume`.
    pub number: Option<f64>,
    /// Titre de la parution (`Title`).
    pub title: Option<String>,
    /// Scénaristes (`Writer`, liste séparée par des virgules).
    pub writers: Vec<String>,
    /// Langue (`LanguageISO`).
    pub language: Option<String>,
}

fn non_empty(text: &str) -> Option<String> {
    let text = text.trim();
    (!text.is_empty()).then(|| text.to_owned())
}

/// Numéro positif (`1050`, `1050.5`, `12,5`) ; les numéros négatifs ou non numériques
/// (`-1`, `1050a`) sont ignorés.
fn number(text: &str) -> Option<f64> {
    let value: f64 = text.trim().replace(',', ".").parse().ok()?;
    (value.is_finite() && value >= 0.0).then_some(value)
}

/// Lit `ComicInfo.xml`. Un document illisible donne `None` : ces métadonnées sont facultatives
/// et ne doivent pas faire échouer l'import.
pub fn parse(text: &str) -> Option<ComicInfo> {
    let elements = xml::parse(COMIC_INFO, text).ok()?;
    let mut info = ComicInfo::default();
    let fields = elements.iter().filter(|e| {
        e.ancestors
            .last()
            .is_some_and(|parent| parent == "ComicInfo")
    });
    for element in fields {
        let text = element.text.as_str();
        match element.name.as_str() {
            "Series" => info.series = non_empty(text),
            "Volume" => info.volume = number(text),
            "Number" => info.number = number(text),
            "Title" => info.title = non_empty(text),
            "Writer" => info.writers = text.split(',').filter_map(non_empty).collect(),
            "LanguageISO" => info.language = non_empty(text),
            _ => {}
        }
    }
    Some(info)
}

#[cfg(test)]
#[allow(clippy::float_cmp)]
mod tests {
    use super::*;

    #[test]
    fn reads_fields() {
        let info = parse(
            r#"<?xml version="1.0"?>
            <ComicInfo xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
              <Title>Le Rêve &amp; l'honneur</Title>
              <Series> One Piece </Series>
              <Number>1050.5</Number>
              <Volume>105</Volume>
              <Writer>Eiichiro Oda, Un Autre</Writer>
              <LanguageISO>fr</LanguageISO>
              <Pages><Page Image="0" Type="FrontCover"/></Pages>
            </ComicInfo>"#,
        )
        .unwrap();
        assert_eq!(info.series.as_deref(), Some("One Piece"));
        assert_eq!(info.number, Some(1050.5));
        assert_eq!(info.volume, Some(105.0));
        assert_eq!(info.title.as_deref(), Some("Le Rêve & l'honneur"));
        assert_eq!(info.writers, ["Eiichiro Oda", "Un Autre"]);
        assert_eq!(info.language.as_deref(), Some("fr"));
    }

    #[test]
    fn ignores_unknown_values() {
        let info = parse("<ComicInfo><Volume>-1</Volume><Number>12a</Number><Series/></ComicInfo>")
            .unwrap();
        assert_eq!(info, ComicInfo::default());
        assert_eq!(parse("<ComicInfo><Series></Title></ComicInfo>"), None);
    }
}
