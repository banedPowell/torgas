# Torgas

Une seule application pour lire tout ce qu'on possède (romans, BD, mangas, PDF, articles) et transformer la lecture en habitude grâce à une progression visible. Tu apportes tes propres fichiers ; Torgas ne vend pas de contenu.

> Projet open source, personnel et non commercial, sous licence [AGPL-3.0](LICENSE).
> Nom tiré de la vallée de Torgas, décor d'*En un combat douteux* de John Steinbeck (1936).

## État

Phase 0 — **prototype** : lecteur EPUB + CBZ sur le web et en desktop (Tauri), import par glisser-déposer, bibliothèque locale.
Critère de sortie : lire un livre entier dessus sans friction. Voir [le plan du prototype](docs/plan-prototype.md).

## Architecture

| Dossier | Rôle |
| --- | --- |
| `app/` | Interface Nuxt 4 (SPA) + Nuxt UI, commune au web et au desktop |
| `crates/torgas-core/` | Cœur Rust : hash, CBZ, métadonnées EPUB, modèle de données |
| `crates/torgas-wasm/` | Bindings WebAssembly du cœur pour le web |
| `src-tauri/` | Coquille desktop Tauri 2 |
| `docs/` | Plan, décisions d'architecture (`docs/adr/`) |

## Développer

Prérequis : Node 22+, pnpm, Rust stable avec la cible `wasm32-unknown-unknown`, wasm-pack.

```bash
pnpm install
pnpm dev          # app web sur http://localhost:3000
pnpm tauri dev    # app desktop
cargo test        # tests du cœur Rust
```

Voir [CONTRIBUTING.md](CONTRIBUTING.md) pour la façon de travailler.
