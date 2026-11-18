//! Mini-lecteur XML interne : aplatit un document en liste d'éléments.
//!
//! Les documents EPUB lus ici (container, OPF, encryption) sont petits ; une
//! liste plate avec noms locaux (préfixes d'espace de noms retirés) suffit.

use quick_xml::events::{BytesStart, Event};
use quick_xml::{Reader, XmlVersion};

use crate::error::{CoreError, Result};

/// Élément XML aplati.
#[derive(Debug, Clone, Default)]
pub(crate) struct Element {
    /// Nom local (`title` pour `dc:title`).
    pub name: String,
    /// Attributs, par nom local.
    pub attrs: Vec<(String, String)>,
    /// Texte directement contenu (entités résolues, espaces aux bords retirés).
    pub text: String,
    /// Noms locaux des ancêtres, de la racine au parent.
    pub ancestors: Vec<String>,
}

impl Element {
    /// Valeur de l'attribut de nom local `name`.
    pub fn attr(&self, name: &str) -> Option<&str> {
        self.attrs
            .iter()
            .find(|(key, _)| key == name)
            .map(|(_, value)| value.as_str())
    }

    /// Indique si l'élément a un ancêtre de nom local `name`.
    pub fn is_inside(&self, name: &str) -> bool {
        self.ancestors.iter().any(|ancestor| ancestor == name)
    }
}

fn local(name: &str) -> String {
    name.to_owned()
}

fn element(file: &str, start: &BytesStart<'_>, ancestors: &[String]) -> Result<Element> {
    let mut attrs = Vec::new();
    for attr in start.attributes() {
        let attr = attr.map_err(|err| CoreError::xml(file, err))?;
        let value = attr
            .normalized_value(XmlVersion::Implicit1_0)
            .map_err(|err| CoreError::xml(file, err))?;
        attrs.push((local(attr.key.local_name().as_ref()), value.into_owned()));
    }
    Ok(Element {
        name: local(start.local_name().as_ref()),
        attrs,
        text: String::new(),
        ancestors: ancestors.to_vec(),
    })
}

fn push_text(done: &mut [Element], open: &[usize], text: &str) {
    if let Some(&index) = open.last()
        && let Some(element) = done.get_mut(index)
    {
        element.text.push_str(text);
    }
}

/// Aplatit `xml` (document `file`, pour les messages d'erreur) en éléments,
/// dans l'ordre du document.
pub(crate) fn parse(file: &str, xml: &str) -> Result<Vec<Element>> {
    let mut reader = Reader::from_str(xml);
    let mut done: Vec<Element> = Vec::new();
    // Pile d'indices dans `done` des éléments ouverts.
    let mut open: Vec<usize> = Vec::new();
    let mut names: Vec<String> = Vec::new();

    loop {
        match reader
            .read_event()
            .map_err(|err| CoreError::xml(file, err))?
        {
            Event::Start(start) => {
                let el = element(file, &start, &names)?;
                names.push(el.name.clone());
                open.push(done.len());
                done.push(el);
            }
            Event::Empty(start) => done.push(element(file, &start, &names)?),
            Event::End(_) => {
                names.pop();
                open.pop();
            }
            Event::Text(text) => push_text(&mut done, &open, &text.xml10_content()),
            Event::CData(data) => {
                push_text(&mut done, &open, &data.xml10_content());
            }
            Event::GeneralRef(reference) => {
                let resolved = if reference.is_char_ref() {
                    reference
                        .resolve_char_ref()
                        .map_err(|err| CoreError::xml(file, err))?
                        .map(String::from)
                } else {
                    quick_xml::escape::resolve_predefined_entity(&reference.xml10_content())
                        .map(str::to_owned)
                };
                if let Some(text) = resolved {
                    push_text(&mut done, &open, &text);
                }
            }
            Event::Eof => break,
            _ => {}
        }
    }

    for element in &mut done {
        let trimmed = element.text.trim();
        if trimmed.len() != element.text.len() {
            element.text = trimmed.to_owned();
        }
    }
    Ok(done)
}

#[cfg(test)]
mod tests {
    use super::parse;

    #[test]
    fn flattens_with_local_names_and_entities() {
        let xml = r#"<?xml version="1.0"?>
            <package xmlns:dc="x"><metadata>
              <dc:title> Tom &amp; Jerry &#233;t&#xE9; </dc:title>
              <meta name="cover" content="c&amp;1"/>
            </metadata></package>"#;
        let elements = parse("t.opf", xml).unwrap();
        let title = elements.iter().find(|e| e.name == "title").unwrap();
        assert_eq!(title.text, "Tom & Jerry été");
        assert!(title.is_inside("metadata"));
        let meta = elements.iter().find(|e| e.name == "meta").unwrap();
        assert_eq!(meta.attr("content"), Some("c&1"));
    }

    #[test]
    fn malformed_xml_is_an_error() {
        assert!(parse("bad.xml", "<a><b></a>").is_err());
    }
}
