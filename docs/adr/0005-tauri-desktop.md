# ADR 0005 — Coquille desktop Tauri 2 et protocole `torgas://`

- Statut : accepté
- Date : 2026-11-19
- Étape du plan : 9 (issue #10)

## Contexte

Le desktop doit offrir le même contrat `CoreBridge` que le web (ADR 0002), avec des fichiers
rangés sur le disque et SQLite natif (ADR 0003). Les pages CBZ et les livres pèsent plusieurs Mo :
les faire passer en JSON par l'IPC serait lent et gourmand en mémoire.

## Décision

- **`src-tauri/` (crate `torgas-desktop`, Tauri 2.12)**, membre du workspace. Adaptateur mince :
  `library.rs` (état `Desktop`, testable sans webview), `commands.rs` (une commande asynchrone par
  méthode de `CoreBridge`, travail sur `spawn_blocking`), `protocol.rs`, `files.rs`. Erreurs typées
  sérialisées en `{ code, message }` (`not_found`, `invalid`, `unsupported`, `io`, `core`…).
- **Transport des octets** :
  - IPC en **binaire brut** pour les gros transferts ponctuels : `import_file` reçoit le fichier en
    corps `InvokeBody::Raw` (nom dans l'en-tête `X-Torgas-Name`, encodé en pourcentage),
    `get_book_bytes` répond par `tauri::ipc::Response` (`ArrayBuffer` côté JS) ;
  - **protocole custom `torgas://`** (`register_asynchronous_uri_scheme_protocol`) pour ce qui
    s'affiche en `<img>` : `page/<workId>/<n>` (cache LRU de 3 `CbzArchive` ouvertes) et
    `cover/<sha256>`. Réponses `Content-Type` exact, `Cache-Control: immutable` (contenu adressé
    par l'empreinte), `Access-Control-Allow-Origin: *` (lecture par `fetch`/`canvas`). Chemins
    validés (identifiant, entier, SHA-256 hexadécimal) : aucun accès au disque par l'URL.
  - L'URL varie selon l'OS (`torgas://localhost/…` sur macOS et Linux, `http://torgas.localhost/…`
    sur Windows) : `TauriBridge` passe par `convertFileSrc(chemin, 'torgas')`, qui choisit la forme.
    La base stocke la forme neutre `torgas://cover/<sha256>`, convertie à la lecture.
- **Emplacements** : livres copiés une fois dans `~/Torgas/<Série ou premier auteur>/<Titre>.<ext>`
  (nom normalisé, compatible Windows, suffixe ` (2)` si collision, écriture atomique) ; base
  `library.sqlite3` et miniatures `covers/<sha256>.jpg` dans `app_data_dir`. Dédoublonnage par
  SHA-256 avant toute analyse ou copie. `TORGAS_LIBRARY_DIR` et `TORGAS_DATA_DIR` remplacent ces
  dossiers (essais).
- **Fichiers venus du système** : glisser-déposer natif (événement `DragDrop` de la fenêtre),
  association `.epub`/`.cbz` (`RunEvent::Opened` sur macOS, arguments ailleurs). Rust les met en
  attente et émet `torgas:opened-files` ; `useTauriFileDrop` les lit (`read_opened_file`, autorisé
  une seule fois et pour ces chemins seulement) et les confie à `useImport` : même file d'import que
  sur le web.
- **Sécurité** : CSP stricte (`default-src 'self'`, images `torgas:`/`http://torgas.localhost`,
  IPC, `blob:` pour les iframes de foliate-js), injection de nonce désactivée pour `style-src`
  seulement (Nuxt UI pose des styles en ligne). Capacités : `core:event`, `core:webview`,
  `core:window` par défaut ; ni shell, ni plugin `fs`.

## Conséquences

- Pages et couvertures ne traversent jamais l'IPC ; le cache HTTP de la webview les garde.
- Le bundle macOS (`.app`, arm64, release LTO) pèse environ 11,7 Mo.
- `generate_context!` en debug pointe sur `devUrl` : clippy et les tests compilent sans build front.

## Limites connues

- **Tout en mémoire** : un CBZ ouvert est lu en entier (`CbzArchive<Vec<u8>>`, 3 au plus) ; un
  livre importé transite deux fois (lecture du fichier déposé, puis import). Lecture depuis le
  disque (mmap ou `File`) à prévoir pour les CBZ de 150 Mo.
- **Pas d'instance unique** : sous Windows et Linux, ouvrir un fichier quand l'app tourne lance
  une seconde instance (plugin `single-instance` à ajouter).
- **Pas de signature** ni de notarisation macOS ; Windows/Linux ne sont construits qu'en CI
  (`desktop.yml`).
- Le fichier d'origine supprimé de `~/Torgas/` rend l'œuvre illisible (`not_found`), sans
  resynchronisation.
