# ADR 0003 — Cœur Rust pur, compilé en natif et en WebAssembly

- Statut : accepté
- Date : 2026-11-18
- Étape du plan : 3 (`torgas-core`)

## Contexte

Torgas tourne sur deux hôtes : la coquille Tauri (desktop) et le navigateur. L'analyse des fichiers (empreinte, archive CBZ, métadonnées EPUB, miniatures, déduction série/volume) et le modèle de données doivent se comporter à l'identique des deux côtés, sans écrire deux fois la même logique en Rust et en TypeScript.

## Décision

1. **`crates/torgas-core` est pur** : aucune dépendance à Tauri, au navigateur ni au système de fichiers. Il prend des octets (`&[u8]`) et rend des valeurs serde. Toutes ses dépendances sont en pur Rust et compilent en `wasm32-unknown-unknown` : `zip` (deflate via `flate2` + `zlib-rs`, sans les autres codecs), `quick-xml`, `sha2`, `image` (jpeg, png, webp, gif seulement).
2. **Deux adaptateurs minces** : `crates/torgas-wasm` (wasm-bindgen, `Uint8Array` ↔ `&[u8]`, erreurs en `JsError`) et, à l'étape 9, `src-tauri` (commandes et protocole `torgas://`). Aucune logique métier dans les adaptateurs.
3. **Un seul schéma SQL** (`schema.sql`, embarqué par `include_str!`, version dans `PRAGMA user_version`) :
   - desktop : feature `sqlite` du cœur, `rusqlite` avec SQLite embarqué (`bundled`), type `Library` qui expose les opérations du contrat `CoreBridge` ;
   - web : le schéma est exporté par `schemaSql()` et exécuté par **wa-sqlite** (VFS OPFS) côté TypeScript. `rusqlite` n'est pas compilé en wasm : la feature `sqlite` est désactivée par défaut.
4. **Types partagés générés** : les structures serde (camelCase) du modèle produisent leurs `.ts` via `ts-rs` (test `export_bindings`, dossier `crates/torgas-core/bindings/`), au lieu d'être recopiées à la main.

## Conséquences

- Les mêmes tests (`cargo test --workspace --all-features`) couvrent le desktop et le web ; les fixtures EPUB/CBZ sont générées dans les tests, sans téléchargement.
- Le module wasm pèse environ 870 ko (≈ 340 ko gzip) en `--release`, surtout à cause des décodeurs d'images ; il n'est chargé qu'à l'import ou à l'ouverture d'un livre (`import()` dynamique).
- Les requêtes SQL du web sont écrites en TypeScript contre le même schéma : la parité avec `db.rs` repose sur les tests des deux côtés.

## Limites connues

- **Tout en mémoire** : `analyze` et `CbzArchive` lisent l'archive entière. Suffisant pour le prototype ; un CBZ de 150 Mo (critère de risque) passera côté desktop par une lecture depuis le disque à l'étape 9.
- **AVIF** : pages AVIF listées et servies telles quelles (le navigateur les décode), mais pas de miniature (aucun décodeur pur Rust compatible wasm).
- **Miniatures en JPEG** : l'encodeur WebP pur Rust ne fait que du sans perte, trop lourd pour des couvertures.
- **Pas de `ComicInfo.xml`** : titre, série et volume d'un CBZ viennent du nom de fichier.
- **Dates** : générées par `SystemTime` dans `db` (natif uniquement) ; côté web, l'app fournit ses propres horodatages ISO 8601.
