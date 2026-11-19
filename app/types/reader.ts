/** Thèmes du lecteur ; `auto` suit le mode clair/sombre de l'app (papier ou sombre). */
export type ReaderTheme = 'auto' | 'paper' | 'sepia' | 'dark' | 'black'
export type ResolvedReaderTheme = Exclude<ReaderTheme, 'auto'>

/** `publisher` : police prévue par l'éditeur du livre (aucune surcharge). */
export type ReaderFont = 'literata' | 'atkinson' | 'publisher'

export type ReaderMargin = 'narrow' | 'normal' | 'wide'

export interface ReaderSettings {
  font: ReaderFont
  /** Taille du texte, en pixels. */
  fontSize: number
  lineHeight: number
  margin: ReaderMargin
  theme: ReaderTheme
}

/** Position courante dans un livre, telle que rapportée par le moteur de rendu. */
export interface ReaderPosition {
  cfi: string
  /** Progression globale, de 0 à 1. */
  progress: number
  chapter?: string
  chapterHref?: string
  pageLabel?: string
  /** Minutes de lecture restantes dans le chapitre. */
  chapterMinutesLeft?: number
}

/** Entrée de sommaire aplatie (profondeur pour l'indentation). */
export interface ReaderTocEntry {
  label: string
  href: string
  depth: number
}
