// Déclarations propres à Torgas : sous-ensemble de l'API de foliate-js utilisé par l'app.

export interface FoliateTocItem {
  label: string
  href: string
  subitems?: FoliateTocItem[]
}

export interface FoliateBook {
  metadata?: { title?: unknown; author?: unknown; language?: string | string[] }
  toc?: FoliateTocItem[]
  dir?: 'ltr' | 'rtl'
}

export interface FoliateRelocateDetail {
  /** Progression globale, de 0 à 1. */
  fraction: number
  cfi: string
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
  goLeft(): Promise<void>
  goRight(): Promise<void>
  next(): Promise<void>
  prev(): Promise<void>
}

export declare class ResponseError extends Error {}
export declare class NotFoundError extends Error {}
export declare class UnsupportedTypeError extends Error {}
export declare function makeBook(file: File | Blob | string): Promise<FoliateBook>
