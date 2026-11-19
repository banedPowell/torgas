import type {
  ReaderFont,
  ReaderMargin,
  ReaderSettings,
  ReaderTheme,
  ReaderTocEntry,
} from '~/types/reader'

export const READER_THEMES: readonly ReaderTheme[] = ['auto', 'paper', 'sepia', 'dark', 'black']
export const READER_FONTS: readonly ReaderFont[] = ['literata', 'atkinson', 'publisher']
export const READER_MARGINS: readonly ReaderMargin[] = ['narrow', 'normal', 'wide']

export const FONT_SIZE = { min: 14, max: 28, step: 1 } as const
export const LINE_HEIGHT = { min: 1.2, max: 2.2, step: 0.05 } as const

export const DEFAULT_READER_SETTINGS: Readonly<ReaderSettings> = {
  font: 'literata',
  fontSize: 18,
  lineHeight: 1.65,
  margin: 'normal',
  theme: 'auto',
}

/** Espace horizontal autour du texte (attribut `gap` du paginateur foliate). */
export const MARGIN_GAP: Record<ReaderMargin, string> = {
  narrow: '4%',
  normal: '7%',
  wide: '12%',
}

/** Familles CSS des polices proposées (`publisher` : celle du livre). */
export const FONT_FAMILY: Record<ReaderFont, string | null> = {
  literata: "'Literata', Georgia, serif",
  atkinson: "'Atkinson Hyperlegible', system-ui, sans-serif",
  publisher: null,
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function pick<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback
}

function num(value: unknown, fallback: number, min: number, max: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? clamp(value, min, max) : fallback
}

/** Valide des réglages lus depuis le stockage (valeurs inconnues → valeurs par défaut). */
export function sanitizeReaderSettings(raw: unknown): ReaderSettings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const d = DEFAULT_READER_SETTINGS
  return {
    font: pick(r.font, READER_FONTS, d.font),
    fontSize: Math.round(num(r.fontSize, d.fontSize, FONT_SIZE.min, FONT_SIZE.max)),
    lineHeight:
      Math.round(num(r.lineHeight, d.lineHeight, LINE_HEIGHT.min, LINE_HEIGHT.max) * 100) / 100,
    margin: pick(r.margin, READER_MARGINS, d.margin),
    theme: pick(r.theme, READER_THEMES, d.theme),
  }
}

export interface BookColors {
  background: string
  text: string
  link: string
  dark: boolean
}

const TEXT_ELEMENTS =
  'p, li, blockquote, dd, dt, td, th, div, span, em, strong, i, b, small, cite, figcaption, h1, h2, h3, h4, h5, h6'

/** Feuille de style injectée dans le livre (`renderer.setStyles` de foliate). */
export function buildBookCss(settings: ReaderSettings, colors: BookColors): string {
  const family = FONT_FAMILY[settings.font]
  return `
html {
  color-scheme: ${colors.dark ? 'dark' : 'light'};
  font-size: ${settings.fontSize}px !important;
  background: ${colors.background} !important;
  color: ${colors.text} !important;
}
body { background: transparent !important; color: inherit !important; }
${TEXT_ELEMENTS} { color: inherit !important; }
a:link, a:visited { color: ${colors.link} !important; }
p, li, blockquote, dd {
  line-height: ${settings.lineHeight} !important;
  hyphens: auto;
  widows: 2;
  orphans: 2;
}
${family ? `body, ${TEXT_ELEMENTS} { font-family: ${family} !important; }` : ''}
pre, code, kbd, samp { font-family: ui-monospace, monospace !important; white-space: pre-wrap !important; }
img, svg, video { max-width: 100%; }
`
}

export type ReaderAction = 'left' | 'right' | 'next' | 'prev' | 'close' | 'toggle'

type KeyLike = Pick<KeyboardEvent, 'key' | 'shiftKey' | 'metaKey' | 'ctrlKey' | 'altKey'>

/** Raccourcis du lecteur : ←/→ tournent la page, Espace avance (Maj+Espace recule), Échap quitte. */
export function readerKeyAction(e: KeyLike): ReaderAction | null {
  if (e.metaKey || e.ctrlKey || e.altKey) return null
  if (e.key === 'ArrowLeft') return 'left'
  if (e.key === 'ArrowRight') return 'right'
  if (e.key === ' ') return e.shiftKey ? 'prev' : 'next'
  if (e.key === 'Escape') return 'close'
  return null
}

/** Zone touchée sur l'écran de lecture (EPUB comme manga). */
export type TapZone = 'left' | 'right' | 'menu'

/** Hauteur de la bande du haut (fraction de l'écran) qui affiche toujours la barre. */
export const TAP_TOP_BAND = 0.25

/**
 * Zones de tap, en fractions (0 à 1) de la largeur et de la hauteur de l'écran : toute la bande
 * du haut et le tiers central affichent la barre ; plus bas, les tiers gauche et droit tournent
 * la page.
 */
export function tapZone(x: number, y: number): TapZone {
  if (y < TAP_TOP_BAND) return 'menu'
  if (x < 1 / 3) return 'left'
  if (x > 2 / 3) return 'right'
  return 'menu'
}

/** Action d'un tap dans le lecteur EPUB (position en fractions de l'écran). */
export function readerTapAction(x: number, y: number): ReaderAction {
  const zone = tapZone(x, y)
  return zone === 'menu' ? 'toggle' : zone
}

interface TocNode {
  label?: string
  href?: string
  subitems?: TocNode[]
}

/** Aplatit le sommaire foliate (arborescent) pour l'afficher en liste indentée. */
export function flattenToc(items: readonly TocNode[] | undefined, depth = 0): ReaderTocEntry[] {
  return (items ?? []).flatMap((item) => [
    ...(item.href ? [{ label: item.label?.trim() || item.href, href: item.href, depth }] : []),
    ...flattenToc(item.subitems, depth + 1),
  ])
}
