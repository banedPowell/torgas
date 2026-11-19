import { fileURLToPath } from 'node:url'

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',

  // Sources à la racine de `app/` (arborescence du plan : app/pages, app/components…).
  srcDir: '.',

  // SPA imposé par Tauri : `nuxt generate` produit `.output/public`.
  ssr: false,

  modules: ['@nuxt/ui', '@nuxt/fonts', '@nuxt/eslint', '@nuxtjs/i18n', '@vueuse/nuxt'],

  devtools: { enabled: true },

  css: ['~/assets/css/main.css'],

  // Types générés depuis Rust (ts-rs) : `app/types/core.ts` les ré-exporte.
  alias: {
    '#core-bindings': fileURLToPath(new URL('../crates/torgas-core/bindings', import.meta.url)),
  },

  vite: {
    // Le worker SQLite importe wa-sqlite (wasm) : format ES pour le découpage en modules.
    worker: { format: 'es' },
    // Modules wasm chargés par `new URL(…, import.meta.url)` : pas de pré-bundling.
    // API Tauri (desktop, import() dynamique) pré-bundlée : pas de rechargement au premier
    // lancement de `pnpm tauri dev`.
    optimizeDeps: {
      exclude: ['@journeyapps/wa-sqlite', 'torgas-wasm'],
      include: ['@tauri-apps/api/core', '@tauri-apps/api/event', '@tauri-apps/api/webview'],
    },
  },

  components: [{ path: '~/components', pathPrefix: false }],

  app: {
    head: {
      htmlAttrs: { lang: 'fr' },
      title: 'Torgas',
      meta: [{ name: 'description', content: 'Lecteur universel local-first' }],
    },
  },

  ui: {
    // Pas de module de polices automatique : @nuxt/fonts est configuré ci-dessous.
    fonts: false,
  },

  icon: {
    // Lucide installé localement (@iconify-json/lucide) : aucune requête réseau.
    // Les icônes utilisées sont embarquées dans le bundle client (SPA, hors ligne).
    provider: 'none',
    fallbackToApi: false,
    serverBundle: false,
    clientBundle: {
      scan: true,
      // Icônes internes de Nuxt UI (non détectées par le scan des sources).
      icons: [
        'lucide:book-open',
        'lucide:check',
        'lucide:chevron-down',
        'lucide:chevron-left',
        'lucide:chevron-right',
        'lucide:chevron-up',
        'lucide:circle-alert',
        'lucide:circle-check',
        'lucide:circle-x',
        'lucide:info',
        'lucide:loader-circle',
        'lucide:menu',
        'lucide:minus',
        'lucide:monitor',
        'lucide:moon',
        'lucide:panel-left-close',
        'lucide:panel-left-open',
        'lucide:plus',
        'lucide:search',
        'lucide:sun',
        'lucide:triangle-alert',
        'lucide:upload',
        'lucide:x',
      ],
    },
  },

  // Polices auto-hébergées depuis les paquets @fontsource : aucune requête externe.
  fonts: {
    providers: {
      google: false,
      googleicons: false,
      bunny: false,
      fontshare: false,
      fontsource: false,
      adobe: false,
    },
    npm: { remote: false },
    defaults: {
      weights: [400, 500, 600, 700],
      styles: ['normal'],
      subsets: ['latin', 'latin-ext'],
    },
    families: [
      {
        name: 'Space Grotesk',
        provider: 'npm',
        providerOptions: { npm: { package: '@fontsource/space-grotesk' } },
      },
      {
        name: 'Oswald',
        provider: 'npm',
        providerOptions: { npm: { package: '@fontsource/oswald' } },
      },
      {
        name: 'JetBrains Mono',
        provider: 'npm',
        providerOptions: { npm: { package: '@fontsource/jetbrains-mono' } },
      },
      {
        name: 'Literata',
        provider: 'npm',
        providerOptions: { npm: { package: '@fontsource/literata' } },
        styles: ['normal', 'italic'],
      },
    ],
  },

  i18n: {
    defaultLocale: 'fr',
    strategy: 'no_prefix',
    locales: [{ code: 'fr', language: 'fr-FR', name: 'Français', file: 'fr.json' }],
  },

  typescript: {
    strict: true,
  },

  eslint: {
    config: { stylistic: false },
  },
})
