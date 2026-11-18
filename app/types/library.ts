import type { FileFormat, ReadingStatus, Series, Work } from './core'

export type LibrarySort = 'title' | 'added' | 'lastRead'
export type LibraryView = 'grid' | 'list'
export type FormatFilter = FileFormat | 'all'
export type StatusFilter = ReadingStatus | 'all'

export interface LibraryFilters {
  query: string
  format: FormatFilter
  status: StatusFilter
}

/** Une œuvre seule, ou une série regroupant ses volumes. */
export type LibraryEntry =
  | { kind: 'work'; id: string; work: Work }
  | {
      kind: 'series'
      id: string
      series: Series
      /** Volumes triés par numéro puis par titre. */
      works: Work[]
      /** Progression moyenne des volumes, de 0 à 1. */
      progress: number
      finishedCount: number
    }
