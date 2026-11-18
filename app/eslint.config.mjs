// @ts-check
import prettier from 'eslint-config-prettier'
import withNuxt from './.nuxt/eslint.config.mjs'

export default withNuxt(
  {
    rules: {
      // Pages et layouts Nuxt portent des noms d'un seul mot (index, default…).
      'vue/multi-word-component-names': 'off',
    },
  },
  {
    // Règle du plan : un composant n'importe jamais un service directement.
    files: ['components/**/*.vue', 'pages/**/*.vue', 'layouts/**/*.vue'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['~/services/*', '~/services/**', '@/services/**', '../services/**'],
              message: 'Passer par un composable (useCore) au lieu d’importer un service.',
            },
          ],
        },
      ],
    },
  },
  prettier,
)
