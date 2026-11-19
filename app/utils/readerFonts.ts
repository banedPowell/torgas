// Polices du lecteur, auto-hébergées (@fontsource) : aucune requête externe.
// Le livre est rendu dans des iframes qui n'héritent pas des @font-face de l'app :
// on leur injecte ces déclarations avec des URL absolues.
import atkinson400 from '@fontsource/atkinson-hyperlegible/files/atkinson-hyperlegible-latin-400-normal.woff2?url'
import atkinson400i from '@fontsource/atkinson-hyperlegible/files/atkinson-hyperlegible-latin-400-italic.woff2?url'
import atkinson700 from '@fontsource/atkinson-hyperlegible/files/atkinson-hyperlegible-latin-700-normal.woff2?url'
import atkinson700i from '@fontsource/atkinson-hyperlegible/files/atkinson-hyperlegible-latin-700-italic.woff2?url'
import literata400 from '@fontsource/literata/files/literata-latin-400-normal.woff2?url'
import literata400i from '@fontsource/literata/files/literata-latin-400-italic.woff2?url'
import literata700 from '@fontsource/literata/files/literata-latin-700-normal.woff2?url'
import literata700i from '@fontsource/literata/files/literata-latin-700-italic.woff2?url'

const FACES: [family: string, url: string, weight: number, style: 'normal' | 'italic'][] = [
  ['Literata', literata400, 400, 'normal'],
  ['Literata', literata400i, 400, 'italic'],
  ['Literata', literata700, 700, 'normal'],
  ['Literata', literata700i, 700, 'italic'],
  ['Atkinson Hyperlegible', atkinson400, 400, 'normal'],
  ['Atkinson Hyperlegible', atkinson400i, 400, 'italic'],
  ['Atkinson Hyperlegible', atkinson700, 700, 'normal'],
  ['Atkinson Hyperlegible', atkinson700i, 700, 'italic'],
]

/** Déclarations @font-face des polices du lecteur, URL résolues depuis `base`. */
export function readerFontFaces(base: string): string {
  return FACES.map(
    ([family, url, weight, style]) =>
      `@font-face { font-family: '${family}'; src: url('${new URL(url, base).href}') format('woff2'); font-weight: ${weight}; font-style: ${style}; font-display: swap; }`,
  ).join('\n')
}
