//! Protocole `torgas://` : pages CBZ et couvertures servies sans passer par l'IPC.
//!
//! L'app construit les URL avec `convertFileSrc(chemin, 'torgas')`, qui donne
//! `torgas://localhost/<chemin encodé>` sur macOS et Linux et
//! `http://torgas.localhost/<chemin encodé>` sur Windows. Seul le chemin compte :
//!
//! - `page/<workId>/<n>` : page `n` (à partir de 0) du CBZ de l'œuvre ;
//! - `cover/<sha256>` : miniature JPEG de la couverture.

use tauri::http::{Response, StatusCode, header};

use crate::error::DesktopError;
use crate::library::Desktop;

/// Nom du schéma enregistré auprès de Tauri.
pub const SCHEME: &str = "torgas";

/// Ressource demandée par une URL `torgas://`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Resource {
    /// Page d'un CBZ.
    Page {
        /// Identifiant de l'œuvre.
        work_id: String,
        /// Index de la page, à partir de 0.
        index: usize,
    },
    /// Couverture par empreinte SHA-256.
    Cover {
        /// Empreinte (64 caractères hexadécimaux minuscules).
        sha256: String,
    },
}

/// Décode les séquences `%XX` (UTF-8) d'un chemin d'URL ou d'un en-tête.
pub(crate) fn percent_decode(input: &str) -> Option<String> {
    let bytes = input.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' {
            let hex = input.get(i + 1..i + 3)?;
            out.push(u8::from_str_radix(hex, 16).ok()?);
            i += 3;
        } else {
            out.push(bytes[i]);
            i += 1;
        }
    }
    String::from_utf8(out).ok()
}

fn is_identifier(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 64
        && id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
}

fn is_sha256(id: &str) -> bool {
    id.len() == 64 && id.chars().all(|c| matches!(c, '0'..='9' | 'a'..='f'))
}

/// Analyse le chemin d'une URL `torgas://` (avec ou sans `/` initial, encodé ou non).
/// Les identifiants sont validés : aucun chemin de fichier ne peut s'y glisser.
pub fn parse_path(path: &str) -> Option<Resource> {
    let decoded = percent_decode(path)?;
    let trimmed = decoded.trim_matches('/');
    let mut parts = trimmed.split('/');
    let resource = match (parts.next()?, parts.next(), parts.next()) {
        ("page", Some(work_id), Some(index)) if is_identifier(work_id) => Resource::Page {
            work_id: work_id.to_owned(),
            index: if index.bytes().all(|b| b.is_ascii_digit()) {
                index.parse().ok()?
            } else {
                return None;
            },
        },
        ("cover", Some(sha256), None) if is_sha256(sha256) => Resource::Cover {
            sha256: sha256.to_owned(),
        },
        _ => return None,
    };
    parts.next().is_none().then_some(resource)
}

/// Les pages et couvertures d'une œuvre ne changent jamais (fichier identifié par son
/// empreinte) : elles peuvent rester en cache indéfiniment.
const IMMUTABLE: &str = "public, max-age=31536000, immutable";

/// Répond à une requête `torgas://` d'après le chemin de son URL.
pub fn respond(desktop: &Desktop, method: &tauri::http::Method, path: &str) -> Response<Vec<u8>> {
    if method != tauri::http::Method::GET && method != tauri::http::Method::HEAD {
        return error(
            StatusCode::METHOD_NOT_ALLOWED,
            "méthode non prise en charge",
        );
    }
    let Some(resource) = parse_path(path) else {
        return error(StatusCode::NOT_FOUND, "ressource torgas:// inconnue");
    };
    let served = match resource {
        Resource::Page { work_id, index } => desktop
            .page(&work_id, index)
            .map(|page| (page.mime, page.bytes)),
        Resource::Cover { sha256 } => desktop
            .cover(&sha256)
            .map(|bytes| ("image/jpeg".to_owned(), bytes)),
    };
    match served {
        Ok((mime, bytes)) => Response::builder()
            .status(StatusCode::OK)
            .header(header::CONTENT_TYPE, mime)
            .header(header::CACHE_CONTROL, IMMUTABLE)
            .header(header::X_CONTENT_TYPE_OPTIONS, "nosniff")
            // Images publiques et immuables : lisibles par `fetch` et un `<canvas>` de l'app,
            // dont l'origine diffère de `torgas:` (tauri://localhost, http://tauri.localhost…).
            .header(header::ACCESS_CONTROL_ALLOW_ORIGIN, "*")
            .body(bytes)
            .unwrap_or_else(|_| error(StatusCode::INTERNAL_SERVER_ERROR, "réponse invalide")),
        Err(err) => error(status_for(&err), &err.to_string()),
    }
}

fn status_for(err: &DesktopError) -> StatusCode {
    match err.code() {
        "not_found" => StatusCode::NOT_FOUND,
        "invalid" | "unsupported" => StatusCode::BAD_REQUEST,
        _ => StatusCode::INTERNAL_SERVER_ERROR,
    }
}

fn error(status: StatusCode, message: &str) -> Response<Vec<u8>> {
    let mut response = Response::new(message.as_bytes().to_vec());
    *response.status_mut() = status;
    if let Ok(value) = header::HeaderValue::from_str("text/plain; charset=utf-8") {
        response.headers_mut().insert(header::CONTENT_TYPE, value);
    }
    if let Ok(value) = header::HeaderValue::from_str("no-store") {
        response.headers_mut().insert(header::CACHE_CONTROL, value);
    }
    response
}

#[cfg(test)]
mod tests {
    use tauri::http::Method;

    use super::*;
    use crate::library::tests::desktop;
    use crate::test_fixtures::cbz;

    const SHA: &str = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

    #[test]
    fn parses_pages_and_covers() {
        let page = Resource::Page {
            work_id: "0197-abc".to_owned(),
            index: 12,
        };
        assert_eq!(parse_path("page/0197-abc/12"), Some(page.clone()));
        assert_eq!(parse_path("/page/0197-abc/12"), Some(page.clone()));
        // `convertFileSrc` encode les `/` du chemin.
        assert_eq!(parse_path("/page%2F0197-abc%2F12"), Some(page));
        assert_eq!(
            parse_path(&format!("/cover%2F{SHA}")),
            Some(Resource::Cover {
                sha256: SHA.to_owned()
            })
        );
    }

    #[test]
    fn rejects_invalid_paths() {
        for path in [
            "",
            "/",
            "page",
            "page/abc",
            "page/abc/-1",
            "page/abc/+1",
            "page/abc/1/extra",
            "page/../1",
            "page/%2E%2E/1",
            "page/a%2Fb/1",
            "cover/abc",
            "cover/../../etc/passwd",
            &format!("cover/{}", SHA.to_uppercase()),
            &format!("cover/{SHA}/x"),
            "book/abc",
            "page/abc/1%",
            "page/abc/%zz",
        ] {
            assert_eq!(parse_path(path), None, "{path}");
        }
    }

    #[test]
    fn serves_pages_with_headers() {
        let (_dir, desktop) = desktop();
        let work = desktop.import_file("a.cbz", &cbz(2)).work.unwrap();

        let ok = respond(&desktop, &Method::GET, &format!("/page%2F{}%2F1", work.id));
        assert_eq!(ok.status(), StatusCode::OK);
        assert_eq!(ok.headers()[header::CONTENT_TYPE], "image/png");
        assert_eq!(ok.headers()[header::CACHE_CONTROL], IMMUTABLE);
        assert_eq!(&ok.body()[1..4], b"PNG");

        let cover = respond(&desktop, &Method::GET, &format!("/cover/{}", work.sha256));
        assert_eq!(cover.status(), StatusCode::OK);
        assert_eq!(cover.headers()[header::CONTENT_TYPE], "image/jpeg");

        let missing = respond(&desktop, &Method::GET, &format!("/page/{}/9", work.id));
        assert_eq!(missing.status(), StatusCode::BAD_REQUEST);
        let unknown = respond(&desktop, &Method::GET, "/page/inconnue/0");
        assert_eq!(unknown.status(), StatusCode::NOT_FOUND);
        let bad = respond(&desktop, &Method::GET, "/autre");
        assert_eq!(bad.status(), StatusCode::NOT_FOUND);
        let post = respond(&desktop, &Method::POST, "/autre");
        assert_eq!(post.status(), StatusCode::METHOD_NOT_ALLOWED);
    }
}
