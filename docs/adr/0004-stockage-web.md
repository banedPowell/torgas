# ADR 0004 — Stockage web : OPFS et SQLite (wa-sqlite) dans un worker

- Statut : accepté
- Date : 2026-11-19
- Étape du plan : 4 (import), `WebBridge`

## Contexte

La version web garde tout sur l'appareil : fichiers EPUB/CBZ, miniatures et bibliothèque SQLite
(même `schema.sql` que le desktop, ADR 0003). Il faut un stockage durable qui marche dans les
versions récentes de Chrome, Firefox et Safari, sans serveur ni en-têtes COOP/COEP (Tauri et
un hébergement statique quelconque doivent suffire).

## Options

| Option | Contre |
| --- | --- |
| SQLite officiel (`sqlite3.wasm` + OPFS) | VFS OPFS rapide réservé à `SharedArrayBuffer` (COOP/COEP), sinon `opfs-sahpool` mono-onglet. |
| wa-sqlite `IDBBatchAtomicVFS` (fil principal) | Données dans IndexedDB, pas dans l'OPFS ; build Asyncify plus lourd et plus lent. |
| wa-sqlite `OPFSAnyContextVFS` (fil principal) | Écrit par `createWritable`, absent ou récent dans Safari ; build Asyncify. |
| wa-sqlite `AccessHandlePoolVFS` (worker) | Une seule connexion : un deuxième onglet échoue. |
| **wa-sqlite `OPFSCoopSyncVFS` (worker)** | Demande un worker et un petit protocole de messages. |

## Décision

- **wa-sqlite, VFS `OPFSCoopSyncVFS`, build synchrone (`wa-sqlite.mjs`), dans un Web Worker**
  (`app/services/core/web/db.worker.ts`). Il repose sur `createSyncAccessHandle`, disponible
  dans les workers de Chrome, Firefox et Safari (16.4+), sans `SharedArrayBuffer` ni Asyncify,
  et partage la base entre onglets par des Web Locks (accès coopératif).
- Paquet **`@journeyapps/wa-sqlite`** : fork maintenu (MIT) de wa-sqlite publié sur npm, qui
  contient `OPFSCoopSyncVFS` ; le paquet `wa-sqlite` de npm (1.0.0, 2024) ne l'a pas.
- Le worker ne fait que du stockage : `init` (schéma `schemaSql()` appliqué selon
  `PRAGMA user_version`, `foreign_keys = ON`), `query`, `batch` (transaction `BEGIN IMMEDIATE`,
  tout ou rien), `write`/`remove` de fichiers OPFS (accès synchrones, donc aussi dans Safari).
  Les messages sont traités dans l'ordre. Toute la logique (requêtes paramétrées, mêmes
  sémantiques que `db.rs`) reste dans `WebBridge`, sur le fil principal.
- Arborescence OPFS : `db/torgas.sqlite3`, `books/<sha256>.<epub|cbz>`, `covers/<sha256>.jpg`.
  Le fil principal lit les fichiers par `getFile()` (blob URL des couvertures et des pages,
  octets EPUB). `navigator.storage.persist()` est demandé au premier import.
- Identifiants UUID v7 générés côté TS (`utils/uuid.ts`), dates ISO 8601 fournies par l'app.

## Conséquences

- Démarrage : le `WebBridge` charge `torgas-wasm` (le schéma vient de `schemaSql()`) et le wasm
  de SQLite (~1,1 Mo, ~500 ko gzip) dès l'ouverture de l'app, la bibliothèque en dépend.
- Les requêtes SQL existent deux fois (Rust et TS) : `services/core/web/sql.ts` suit `db.rs`.
- Pas de test automatisé du `WebBridge` (OPFS absent de happy-dom) : vérification manuelle dans
  le navigateur ; un test Playwright du parcours d'import viendra avec l'étape de bout en bout.
- Navigation privée de Firefox (pas d'OPFS) : le cœur est indisponible et la bibliothèque affiche
  son état d'erreur.
