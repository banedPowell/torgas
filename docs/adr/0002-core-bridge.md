# ADR 0002 — Interface `CoreBridge` entre l'app et le cœur

- Statut : accepté
- Date : 2026-11-18

## Contexte

Le cœur (`torgas-core`, Rust) tourne en natif dans Tauri et en WebAssembly sur le web. Le
stockage diffère (dossier `~/Torgas/` + SQLite natif d'un côté, OPFS + wa-sqlite de l'autre),
tout comme le transport des pages CBZ (protocole `torgas://` ou `Blob` URL). L'interface ne doit
pas en dépendre, et doit rester testable sans Rust.

## Décision

- Une interface TypeScript unique, `CoreBridge` (`app/services/core/bridge.ts`), et des types
  partagés (`app/types/core.ts` : `Work`, `Series`, `Locator`, `Bookmark`, `ImportResult`…).
  Ces fichiers sont le contrat : toute évolution se fait d'abord ici, puis dans les implémentations.
- Implémentations :
  - `MemoryBridge` (`services/core/memory.ts`) : en mémoire, pour Vitest et le développement de
    l'interface ;
  - `WebBridge` (à venir) : `torgas-wasm` chargé par `import()` dynamique, OPFS, wa-sqlite ;
  - `TauriBridge` (à venir) : `invoke()` vers les commandes Rust, pages via `torgas://`.
- Le bridge est créé une fois par un plugin Nuxt (`plugins/core.ts`, choix via
  `window.__TAURI_INTERNALS__` à terme) et exposé par le composable `useCore()`.
- **Règle de couches** : un composant affiche, un composable gère la logique, un service parle au
  cœur. Seuls les composables appellent `useCore()` ; ESLint interdit l'import de `~/services` dans
  `components/`, `pages/` et `layouts/`.
- À terme, les types seront générés depuis Rust (`ts-rs` ou `specta`) plutôt que recopiés.

## Conséquences

- Les composables se testent avec `MemoryBridge` (via `mockNuxtImport('useCore', …)`), sans wasm.
- Les opérations sont asynchrones et sérialisables : pas d'objets Rust exposés à l'interface.
- Ajouter une capacité au cœur demande de toucher trois implémentations : c'est voulu, l'interface
  reste petite.
