/**
 * Types du contrat entre l'app et le cœur Rust (`torgas-core`).
 * À terme, générés depuis Rust (ts-rs ou specta) ; en attendant, ce fichier fait foi.
 */

export type FileFormat = 'epub' | 'cbz'
export type WorkKind = 'novel' | 'comic'
export type ReadingStatus = 'to_read' | 'reading' | 'finished' | 'abandoned' | 'paused'
export type ReadingDirection = 'ltr' | 'rtl'

export interface Series {
  id: string
  title: string
  direction: ReadingDirection
}

export interface Work {
  id: string
  title: string
  authors: string[]
  kind: WorkKind
  language?: string
  coverUrl?: string
  seriesId?: string
  volume?: number
  format: FileFormat
  sha256: string
  sizeBytes: number
  pageCount?: number
  addedAt: string
  status: ReadingStatus
  /** Progression globale, de 0 à 1. */
  progress: number
  lastReadAt?: string
}

export interface Locator {
  format: FileFormat
  cfi?: string
  page?: number
  progress: number
}

export interface Bookmark {
  id: string
  workId: string
  locator: Locator
  label: string
  createdAt: string
}

export type ImportStatus = 'imported' | 'duplicate' | 'drm' | 'unsupported' | 'error'

export interface ImportResult {
  status: ImportStatus
  work?: Work
  message?: string
}
