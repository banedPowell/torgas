# Plan — Prototype Torgas (phase 0)

## Contexte

Le doc « Torgas — cadrage produit & technique » fixe la **phase 0 – Prototype** (4 à 6 semaines) : lecteur EPUB + CBZ sur le web, import par glisser-déposer, bibliothèque locale, coquille Tauri desktop. Son rôle est de valider le moteur de lecture, la partie la plus risquée. **Critère de passage vers le MVP : « je lis un livre entier dessus sans friction ».**

La maquette « Torgas — maquette » (canvas Design, 47 artboards) donne les écrans, le thème Nuxt UI « papier et brique » et la typo.

Choix tranchés avec toi :
- périmètre **phase 0 stricte** : Bibliothèque, Import, Fiche œuvre/série, Lecteur EPUB, Lecteur manga, en thème clair et sombre ;
- **cœur Rust dès le départ** (natif dans Tauri, WebAssembly sur le web) ;
- **nouveau dépôt** dans un dossier que tu choisiras au démarrage (`request_directory`).

Hors périmètre (MVP et après) : comptes, serveur, sync iroh/CRDT, mobile Tauri, PDF, XP/séries, livres papier, flux RSS, Découvrir/OPDS, social, onboarding.

## Architecture du dépôt (monorepo)

```
torgas/
  app/                  Nuxt 4 (SPA, ssr:false) + Nuxt UI
  crates/torgas-core/   cœur Rust : hash, zip CBZ, métadonnées EPUB, modèle, SQL
  crates/torgas-wasm/   bindings wasm-bindgen pour le web
  src-tauri/            coquille Tauri 2 (commandes qui appellent torgas-core)
  LICENSE (AGPL-3.0), README, Cargo.toml (workspace), pnpm-workspace.yaml
```

**Une interface, deux backends.** L'app appelle une interface TS `CoreBridge` (`importFile`, `listWorks`, `getWork`, `getPage`, `savePosition`…). Deux implémentations :
- `TauriBridge` → `invoke()` vers les commandes Rust ; fichiers dans le dossier de la bibliothèque ; SQLite via `rusqlite` ; pages CBZ servies par un **protocole custom Tauri** (`torgas://page/<hash>/<n>`), comme prévu dans l'onglet Technique, pour ne pas faire transiter des Mo par l'IPC.
- `WebBridge` → `torgas-wasm` ; fichiers dans l'**OPFS** ; SQLite via **wa-sqlite** (VFS OPFS) ; pages CBZ servies en `Blob` URLs.

Le choix se fait au démarrage via `window.__TAURI_INTERNALS__`.

## Modèle de données (sous-ensemble du doc)

Tables SQLite, schéma partagé dans `torgas-core` (fichier `.sql` embarqué) :
- `work` : id, titre, auteurs, type (roman/manga), langue, couverture, `series_id`, volume
- `series` : id, titre, sens de lecture (ltr/rtl)
- `file` : id, `work_id`, format (epub/cbz), `sha256`, taille, chemin local
- `library_entry` : `work_id`, statut (à lire, en cours, terminé, abandonné, en pause), progression %, dates
- `locator` : `work_id`, format, `cfi` ou page, progression globale
- `bookmark` : `work_id`, locator, libellé
- `reading_session` : `work_id`, début, fin, minutes (enregistrée dès maintenant, car c'est la source de vérité de l'XP plus tard)

Pas encore d'annotations ni de surlignages (reportés au MVP, sauf si le temps le permet : voir étape 6).

## Étapes

1. **Squelette** — monorepo, workspace Cargo, `pnpm create nuxt` (mode SPA), Nuxt UI, Tauri 2 (`src-tauri` pointant sur `app/.output/public`), CI GitHub Actions (clippy, `cargo test`, `vue-tsc`, build web). Licence AGPL-3.0.
2. **Thème** — `app.config.ts` avec `primary: 'custom-primary'`, `secondary: 'custom-secondary'`, `neutral: 'custom-neutral'`, champs en variante `soft` ; palettes dans `main.css` (`@theme`) : neutre beige chaud (100 `#E4DFD4`, 950 `#1D1B18`), primaire brique (500 `#8D3130`, 400 `#BE4F3E`), secondaire corail (500 `#FF3E40`, 400 `#FF7676`, réservé aux récompenses : non utilisé en phase 0). Polices Space Grotesk, Oswald, JetBrains Mono, Literata. Les valeurs exactes viennent de la note « palette » et du `<helmet>` des artboards du canvas.
3. **`torgas-core`** — `hash::sha256(bytes)`, `cbz::list_pages(bytes)` (tri naturel des noms), `cbz::page(bytes, n)`, `epub::metadata(bytes)` (titre, auteurs, langue, couverture via OPF), déduction série/volume depuis le nom de fichier CBZ (`Titre v03.cbz`, `Titre - Tome 3`), schéma SQL + requêtes. Tests unitaires avec des fichiers d'exemple du domaine public (Standard Ebooks, un CBZ généré en test).
4. **Import (glisser-déposer)** — zone de dépôt plein écran + bouton fichier ; file d'import avec progression (`UProgress`), dédoublonnage par hash (alerte « déjà dans ta bibliothèque »), métadonnées à confirmer. Desktop : copie dans `~/Torgas/` (dossier par auteur ou série, nom normalisé). Web : OPFS. État d'erreur « fichier avec DRM » (détection de `META-INF/encryption.xml`). Écrans : artboard `DesktopBibliotheque` (zone d'import) et état « import en cours » de `Bibliotheque`.
5. **Bibliothèque + Fiche** — grille/liste, tri (titre, ajout, dernière lecture), filtres format et statut, séries regroupées, barre « Reprendre » en bas. Fiche œuvre/série : couverture, métadonnées, statut modifiable, progression, liste des volumes avec « prochain volume ». États vide et série incomplète. Artboards `Bibliotheque`, `FicheSerie`, `DesktopBibliotheque` et leurs variantes sombres.
6. **Lecteur EPUB** — **foliate-js** (vendored dans `app/vendor/foliate-js`, il n'est pas sur npm) dans un composant `ReaderEpub.vue` ; barre escamotable au tap, sommaire, réglages typo (`USlideover` : police Literata/Atkinson/éditeur, taille, interligne, thèmes papier, sépia, sombre, noir OLED), marque-pages, position CFI sauvegardée toutes les 5 s et à la fermeture, reprise exacte. Le menu de sélection (surligner/noter) de l'artboard `LecteurEPUB` ne vient qu'en bonus si l'étape est en avance.
7. **Lecteur manga** — `ReaderComic.vue` (foliate-js lit aussi le CBZ, mais on passe par le cœur Rust pour les pages, afin de tester le protocole custom) : simple/double page, sens droite→gauche réglé par série, mode webtoon (défilement continu), préchargement des 3 pages suivantes, miniatures, état « fin de volume » avec « volume suivant ». Artboard `LecteurManga`.
8. **Sessions et suivi minimal** — `reading_session` démarrée à l'ouverture du lecteur, pause après 2 min d'inactivité, minutes et pourcentage enregistrés ; statut passé à « en cours » puis « terminé » à 100 %. Rien n'est affiché au-delà de la progression (pas d'XP).
9. **Coquille Tauri desktop** — commandes Rust, protocole `torgas://`, ouverture de fichiers par association `.epub`/`.cbz` et glisser-déposer sur la fenêtre, build macOS (`pnpm tauri build`). Windows/Linux via la CI uniquement.

L'ordre compte : 1 → 3 avant tout le reste ; 4 à 8 se construisent sur le web d'abord (plus rapide à itérer), puis 9 branche le `TauriBridge`.

## Porter la maquette

Chaque artboard du canvas est un `.dc.html` lisible avec l'action `read` de l'outil Artifact (chemin `project/<Nom>.dc.html`). Pour chaque vue : lire l'artboard clair et sombre, reprendre la structure et les espacements, remplacer le markup par les composants Nuxt UI listés dans l'onglet Maquette (`UTabs`, `USelectMenu`, `UFileUpload`, `UProgress`, `UAlert`, `UAccordion`, `USlideover`, `UPopover`, `USlider`, `UFieldGroup`). Les couleurs passent uniquement par les jetons `--ui-*`, jamais par des hex en dur, ce qui donne le thème sombre gratuitement.

## Bonnes pratiques de travail

### Organisation du code Nuxt

Règle de base : **un composant affiche, un composable gère la logique, un service parle au cœur**. Aucun appel à `CoreBridge` depuis un composant.

```
app/
  pages/                 routes fines : assemblent des composants, lisent les params
    index.vue            → Bibliothèque
    works/[id].vue       → Fiche œuvre/série
    read/[id].vue        → Lecteur (choisit EPUB ou manga)
  layouts/
    default.vue          navigation + barre Reprendre
    reader.vue           plein écran, sans navigation
  components/
    library/             LibraryGrid, LibraryList, LibraryFilters, WorkCard, ResumeBar
    import/              ImportDropzone, ImportQueue, ImportItem
    work/                WorkHeader, WorkVolumes, WorkStatusSelect
    reader/              ReaderEpub, ReaderComic, ReaderToolbar, ReaderSettings, ReaderToc
    ui/                  petites briques maison réutilisables (EmptyState, CoverImage)
  composables/
    useLibrary.ts        liste, tri, filtres (état dérivé avec computed)
    useWork.ts           une œuvre, sa série, ses volumes
    useImport.ts         file d'import, progression, doublons, erreurs
    useReader.ts         position, sauvegarde du locator, marque-pages
    useReadingSession.ts chrono, pause après inactivité
    useReaderSettings.ts police, taille, thème (persisté)
  services/
    core/bridge.ts       interface CoreBridge
    core/tauri.ts        TauriBridge
    core/web.ts          WebBridge (wasm + OPFS)
  types/                 types partagés (Work, Series, Locator…), générés depuis Rust si possible (ts-rs ou specta)
  utils/                 fonctions pures, testées (formatage des durées, tri naturel côté TS)
```

- Composants **présentationnels** : reçoivent des `props`, émettent des `emits` typés (`defineProps<…>()`, `defineEmits<…>()`), pas d'état global. Un composant dépasse 200 lignes ? On le découpe.
- Composables : nom en `use…`, renvoient des `ref`/`computed` en lecture (`readonly()`) et des fonctions d'action ; aucun accès au DOM sauf le lecteur, isolé dans `ReaderEpub`/`ReaderComic`.
- État partagé entre pages (bibliothèque chargée, réglages du lecteur) : `useState` de Nuxt ou un store Pinia unique `library`, pas de variables module mutables.
- `<script setup lang="ts">` partout, TypeScript strict, `vue-tsc` en CI.
- Auto-imports Nuxt conservés, mais un composant n'importe jamais un service directement.

### Performance Nuxt

- `ssr: false` (SPA imposé par Tauri) ; `nuxt generate` pour le web, `app/.output/public` pour Tauri.
- Pages et lecteurs chargés à la demande : `ReaderEpub` et `ReaderComic` en composants `Lazy…` (foliate-js et wasm ne sont téléchargés qu'à l'ouverture d'un livre).
- Module wasm chargé une seule fois (`import()` dynamique dans `WebBridge`, promesse mémorisée).
- Listes longues : `useVirtualList` (VueUse) dès 200 œuvres ; couvertures en miniatures générées par Rust à l'import (pas l'image d'origine), `loading="lazy"` et `decoding="async"`.
- Écritures fréquentes (position de lecture) : `useDebounceFn` / `useThrottleFn`, sauvegarde finale sur `visibilitychange` et `beforeunload`.
- `shallowRef` pour les gros objets (liste d'œuvres, livre ouvert foliate) afin d'éviter la réactivité profonde.
- Polices via `@nuxt/fonts` (auto-hébergées, `font-display: swap`), aucune requête Google Fonts à l'exécution (respect de la vie privée et fonctionnement hors ligne).
- `@nuxt/image` non utilisé pour les couvertures locales (Blob/`torgas://`), seulement pour les assets statiques éventuels.
- Mesure : `nuxi analyze` en fin de chaque étape ; budget indicatif de 250 ko JS gzip pour l'écran Bibliothèque, hors lecteur.

### Nuxt UI

- Thème uniquement dans `app.config.ts` (`ui.colors`, et `ui.<composant>.defaultVariants` / `slots`) et `main.css` (`@theme`) ; pas de surcharge CSS ciblant les classes internes des composants.
- Personnaliser un composant par sa prop `ui` ou `class`, jamais en le recopiant.
- Couleurs via jetons sémantiques (`text-muted`, `bg-elevated`, `border-default`, `--ui-primary`) : aucune couleur Tailwind brute (`bg-stone-100`) ni hex dans les composants. Le sombre vient alors tout seul.
- `secondary` réservé aux récompenses : en phase 0, aucun usage (règle relue en revue).
- Icônes via `UIcon` et un seul jeu (Lucide), installé localement (`@iconify-json/lucide`) pour le hors ligne.
- Retours utilisateur : `useToast` pour les confirmations courtes (« 3 œuvres importées »), `UAlert` pour les états persistants (DRM, doublon).
- Raccourcis clavier via `defineShortcuts` (←/→ pages, `Espace`, `Échap` pour quitter le lecteur).

### Interface et accessibilité

- Chaque vue a ses états dessinés : chargement (squelettes `USkeleton`), vide (avec action), erreur (avec piste de solution), comme listés dans l'onglet Maquette.
- Cibles tactiles de 44 px minimum ; contraste 4,5:1 vérifié en clair et en sombre.
- Vrais éléments interactifs (`UButton`, `ULink`), `aria-label` sur les boutons-icônes ; navigation complète au clavier, focus visible.
- Mouvements sobres : transitions de 150 à 200 ms, désactivées si `prefers-reduced-motion`.
- Mise en page mobile d'abord (390 px) puis desktop (1280 px), comme dans la maquette ; aucun défilement horizontal de la page.
- Textes en français centralisés dès le départ (`@nuxtjs/i18n`, une locale `fr`), pour ne pas avoir à extraire les chaînes plus tard.
- Lecteur : aucune interface ne gêne la lecture ; la barre se masque seule après 3 s.

### Rust

- `cargo fmt` et `cargo clippy -D warnings` en CI ; erreurs typées avec `thiserror`, pas de `unwrap()` hors tests.
- `torgas-core` sans dépendance à Tauri ni au navigateur (pur, testable) ; les crates `torgas-wasm` et `src-tauri` ne font que l'adapter.
- Types partagés avec TS générés (`specta` ou `ts-rs`) plutôt que recopiés à la main.

### Façon de travailler

- Une branche et une PR par étape du plan, petite et relisible ; commits au format Conventional Commits (`feat(reader): …`).
- Chaque étape se termine par : tests verts, `typecheck` vert, captures clair/sombre comparées à l'artboard, mise à jour du README.
- Lint et format : `@nuxt/eslint` + Prettier côté app, hook `pre-commit` (lint-staged) pour éviter les PR de mise en forme.
- Tests : Vitest pour `utils/` et composables (avec un `CoreBridge` factice), `cargo test` pour le cœur, un test Playwright du parcours « importer → lire → rouvrir à la même page ».
- Décisions d'architecture notées en ADR courts dans `docs/adr/` (une page chacune).

## Vérification

- `cargo test -p torgas-core` (hash, tri des pages CBZ, métadonnées EPUB, déduction de volume).
- `pnpm --filter app typecheck` et `pnpm --filter app build`.
- Parcours manuel dans le navigateur intégré (`preview_start` sur `pnpm dev`) : importer un EPUB de Standard Ebooks et un CBZ, vérifier le dédoublonnage, lire, fermer, rouvrir à la même position, passer en sombre, tester le sens droite→gauche et le mode webtoon. Captures comparées aux artboards du canvas.
- Desktop : `pnpm tauri dev`, mêmes parcours, plus l'ouverture d'un CBZ de 150 Mo pour mesurer la fluidité (critère de risque « gros CBZ » de l'onglet Roadmap).
- Critère de sortie de phase : lire un livre entier dessus sans friction, puis ouvrir la phase 1 (MVP).
