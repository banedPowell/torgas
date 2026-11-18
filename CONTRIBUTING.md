# Contribuer à Torgas

## Méthode

- **Trunk-based** : `main` est toujours vert et protégée. Aucun push direct.
- Une branche courte par issue : `feat/…`, `fix/…`, `chore/…`, `docs/…`.
- Une PR par étape, petite et relisible, liée à son issue (`Closes #N`).
- Fusion en **squash** uniquement ; le titre de la PR devient le commit, au format [Conventional Commits](https://www.conventionalcommits.org/fr/) en français : `feat(reader): reprise exacte de la position`.
- La CI (`Rust`, `App`, `Conventional Commits`) doit passer et les conversations être résolues avant la fusion.
- Les décisions d'architecture se notent en ADR d'une page dans `docs/adr/`.

## Code

**Nuxt** — un composant affiche, un composable gère la logique, un service parle au cœur.
- `components/` : présentationnels, `defineProps`/`defineEmits` typés, moins de 200 lignes.
- `composables/` : `use…`, renvoient un état en lecture et des actions.
- `services/core/` : seul endroit qui parle au cœur (`CoreBridge`). Un composant ne l'importe jamais.
- `<script setup lang="ts">`, TypeScript strict.

**Nuxt UI** — thème dans `app.config.ts` et `assets/css/main.css` seulement ; couleurs par jetons sémantiques (`text-muted`, `bg-elevated`…), jamais de couleur brute ; la couleur `secondary` est réservée aux récompenses.

**Interface** — états chargement, vide et erreur pour chaque vue ; cibles de 44 px ; contraste 4,5:1 en clair et en sombre ; navigation au clavier ; `prefers-reduced-motion` respecté ; textes dans `i18n/locales/fr.json`.

**Rust** — `torgas-core` reste pur (ni Tauri ni navigateur) ; erreurs typées `thiserror`, pas de `unwrap()` hors tests ; `cargo fmt` et `clippy -D warnings`.

## Vérifier avant la PR

```bash
cargo fmt --all --check && cargo clippy --workspace --all-targets --all-features -- -D warnings && cargo test --workspace --all-features
pnpm lint && pnpm typecheck && pnpm test
```

## Cadre légal

Torgas ne fournit, ne nomme ni ne pré-configure aucune source tierce de contenu, et ne contourne aucune DRM. Les PR qui ajoutent ce genre de connecteur seront refusées.
