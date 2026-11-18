# ADR 0001 — Nuxt 4 en SPA avec Nuxt UI

- Statut : accepté
- Date : 2026-11-18

## Contexte

Torgas doit tourner dans le navigateur (web, hors ligne, fichiers dans l'OPFS) et dans une coquille
Tauri 2 (desktop, puis mobile). Tauri sert des fichiers statiques : il n'y a pas de serveur Node.
La maquette « papier et brique » est pensée pour Nuxt UI (jetons `--ui-*`, `app.config.ts`).

## Décision

- **Nuxt 4 en SPA** (`ssr: false`) dans `app/`, sources à la racine du paquet (`srcDir: '.'`)
  pour suivre l'arborescence du plan (`app/pages`, `app/components`…). `nuxt generate` produit
  `app/.output/public`, consommé tel quel par le web et par Tauri.
- **Nuxt UI v4** pour les composants, avec le thème défini uniquement dans `app.config.ts`
  (`ui.colors` = `custom-primary`, `custom-secondary`, `custom-neutral` ; champs en variante
  `soft`) et `assets/css/main.css` (`@theme` : palettes 50→950 en oklch reprises de la maquette,
  jetons sémantiques clair/sombre, `--ui-radius`). Aucune couleur brute dans les composants.
- **Hors ligne et vie privée** : polices auto-hébergées via `@nuxt/fonts` et le fournisseur `npm`
  (paquets `@fontsource/*`, aucun fournisseur distant) ; icônes Lucide installées localement
  (`@iconify-json/lucide`) et embarquées dans le bundle client (`provider: 'none'`).
- Textes centralisés avec `@nuxtjs/i18n` (locale `fr` unique pour l'instant).
- Navigation : `UDashboardGroup`/`UDashboardSidebar` en desktop, onglets bas en mobile.

## Conséquences

- Pas de rendu serveur : le premier affichage dépend du JS ; acceptable pour une app locale.
- Pas de routes serveur Nuxt : tout accès aux données passe par le cœur (voir ADR 0002).
- Les icônes construites dynamiquement doivent apparaître en clair dans le code (ou dans
  `icon.clientBundle.icons`) pour être embarquées.
- Nuxt UI évolue vite : la version est verrouillée par le lockfile et mise à jour volontairement.
