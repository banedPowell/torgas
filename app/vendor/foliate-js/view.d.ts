// Déclarations propres à Torgas : sous-ensemble de l'API de foliate-js utilisé par l'app.

export interface FoliateTocItem {
  label: string
  href: string
  subitems?: FoliateTocItem[]
}

export interface FoliateSection {
  /** Chemin de la section dans le livre (cible des liens du sommaire). */
  id: string
  /** CFI de l'élément du spine. */
  cfi?: string
  linear?: string
  size?: number
  /** Document XHTML de la section, analysé à part (hors du rendu). */
  createDocument(): Promise<Document>
  /** Résout un lien relatif à cette section depuis la racine de l'archive. */
  resolveHref?(href: string): string
}

export interface FoliateLandmark {
  label?: string
  href?: string
  type?: string[]
}

export interface FoliateBook {
  metadata?: { title?: unknown; author?: unknown; language?: string | string[] }
  toc?: FoliateTocItem[]
  landmarks?: FoliateLandmark[] | null
  sections: FoliateSection[]
  dir?: 'ltr' | 'rtl'
  /** Section (index dans `sections`) visée par un lien interne, ou `null`. */
  resolveHref?(href: string): { index: number } | null
}

/** Événement `link` (annulable) : un lien interne cliqué dans le livre. */
export interface FoliateLinkDetail {
  a: HTMLAnchorElement
  /** Lien résolu depuis la racine de l'archive (`OEBPS/notes.xhtml#n1`). */
  href: string
}

export interface FoliateRelocateDetail {
  /** Progression globale, de 0 à 1. */
  fraction: number
  cfi: string
  /** Section courante (index dans `book.sections`). */
  section?: { current: number; total: number }
  tocItem?: { label?: string; href?: string }
  pageItem?: { label?: string }
  /** Minutes de lecture restantes (section et livre). */
  time?: { section: number; total: number }
}

export interface FoliateRenderer extends HTMLElement {
  setStyles?(css: string | [string, string]): void
  next(): Promise<void>
  prev(): Promise<void>
}

export declare class View extends HTMLElement {
  book: FoliateBook
  renderer: FoliateRenderer
  lastLocation: FoliateRelocateDetail | null
  open(book: File | Blob | string): Promise<void>
  close(): void
  init(options: { lastLocation?: string | null; showTextStart?: boolean }): Promise<void>
  goTo(target: string | number): Promise<unknown>
  goToFraction(fraction: number): Promise<void>
  /** Début de chaque section dans le livre, de 0 à 1 (une valeur de plus que de sections). */
  getSectionFractions(): number[]
  goLeft(): Promise<void>
  goRight(): Promise<void>
  next(): Promise<void>
  prev(): Promise<void>
}

export declare class ResponseError extends Error {}
export declare class NotFoundError extends Error {}
export declare class UnsupportedTypeError extends Error {}
export declare function makeBook(file: File | Blob | string): Promise<FoliateBook>
