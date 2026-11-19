//! Bindings WebAssembly de `torgas-core` pour la version web de Torgas.
//!
//! Ce crate ne fait qu'adapter le cœur : conversion des octets
//! (`Uint8Array`), sérialisation serde vers des objets JS et erreurs en
//! `JsError`. Aucune logique métier ici.

use serde::Serialize;
use torgas_core::{analysis, cbz, hash, naming, schema, thumbnail};
use wasm_bindgen::prelude::*;

/// Installe le hook de panique (messages lisibles dans la console) au
/// chargement du module.
#[wasm_bindgen(start)]
pub fn start() {
    console_error_panic_hook::set_once();
}

/// Sérialise une valeur en objet JS (`Vec<u8>` → `Uint8Array`, `Option::None`
/// → propriété absente).
fn to_js<T: Serialize>(value: &T) -> Result<JsValue, JsError> {
    Ok(serde_wasm_bindgen::to_value(value)?)
}

/// Analyse un fichier importé : format (`"epub" | "cbz"`), empreinte,
/// métadonnées, couverture. Lève une erreur si le format n'est pas pris en charge.
#[wasm_bindgen]
pub fn analyze(name: &str, bytes: &[u8]) -> Result<JsValue, JsError> {
    to_js(&analysis::analyze(name, bytes)?)
}

/// Génère une miniature JPEG d'au plus `maxWidth` pixels de large (360 au
/// maximum). Renvoie `{ mime, bytes }`.
#[wasm_bindgen]
pub fn thumbnail(
    bytes: &[u8],
    #[wasm_bindgen(js_name = maxWidth)] max_width: u32,
) -> Result<JsValue, JsError> {
    to_js(&thumbnail::make(bytes, max_width)?)
}

/// Empreinte SHA-256 en hexadécimal.
#[wasm_bindgen]
pub fn sha256(bytes: &[u8]) -> String {
    hash::sha256(bytes)
}

/// Script SQL du schéma de la bibliothèque (pour wa-sqlite).
#[wasm_bindgen(js_name = schemaSql)]
pub fn schema_sql() -> String {
    schema::SCHEMA_SQL.to_owned()
}

/// Version du schéma (`PRAGMA user_version`).
#[wasm_bindgen(js_name = schemaVersion)]
pub fn schema_version() -> u32 {
    schema::SCHEMA_VERSION
}

/// Migrations d'une base existante, par version croissante : `[{ version, sql }]`.
/// Une base vide reçoit directement `schemaSql()`.
#[wasm_bindgen]
pub fn migrations() -> Result<JsValue, JsError> {
    to_js(&schema::MIGRATIONS)
}

/// Série et volume déduits d'un nom de fichier : `{ seriesTitle, volume }`,
/// ou `undefined` si le nom ne contient pas de volume.
#[wasm_bindgen(js_name = parseVolume)]
pub fn parse_volume(name: &str) -> Result<JsValue, JsError> {
    #[derive(Serialize)]
    #[serde(rename_all = "camelCase")]
    struct Parsed {
        series_title: String,
        volume: f64,
    }
    match naming::parse_volume(name) {
        Some((series_title, volume)) => to_js(&Parsed {
            series_title,
            volume,
        }),
        None => Ok(JsValue::UNDEFINED),
    }
}

/// Archive CBZ ouverte en mémoire, pages triées naturellement.
#[wasm_bindgen]
pub struct CbzArchive {
    inner: cbz::CbzArchive<Vec<u8>>,
}

#[wasm_bindgen]
impl CbzArchive {
    /// Ouvre une archive depuis son contenu (copié dans la mémoire wasm).
    #[wasm_bindgen(constructor)]
    pub fn new(bytes: Vec<u8>) -> Result<CbzArchive, JsError> {
        Ok(Self {
            inner: cbz::CbzArchive::open(bytes)?,
        })
    }

    /// Nombre de pages.
    #[wasm_bindgen(js_name = pageCount)]
    pub fn page_count(&self) -> usize {
        self.inner.page_count()
    }

    /// Page `n` (à partir de 0) : `{ mime, bytes }`.
    pub fn page(&mut self, n: usize) -> Result<JsValue, JsError> {
        to_js(&self.inner.page(n)?)
    }

    /// Chemins des pages dans l'archive, dans l'ordre de lecture.
    #[wasm_bindgen(js_name = pageNames)]
    pub fn page_names(&self) -> Vec<String> {
        self.inner.page_names()
    }
}
