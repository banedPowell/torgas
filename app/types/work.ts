import type { ChapterState } from '~/utils/chapters'
import type { FileFormat, Series, Work, WorkKind } from './core'

/** Ce que la fiche affiche : une œuvre seule, ou une série avec ses œuvres (volumes et chapitres). */
export type WorkTarget =
  { kind: 'work'; work: Work } | { kind: 'series'; series: Series; works: Work[] }

/** Vue de la liste d'une série : ses volumes ou ses chapitres. */
export type SeriesView = 'volumes' | 'chapters'

/** Métadonnées de l'en-tête de la fiche (agrégées sur les volumes pour une série). */
export interface WorkMeta {
  title: string
  authors: string[]
  coverUrl?: string
  format: FileFormat
  kind: WorkKind
  language?: string
  sizeBytes: number
  /** Date d'ajout (la plus ancienne pour une série). */
  addedAt: string
  isSeries: boolean
  /** Volumes entiers (1 pour une œuvre seule). */
  volumeCount: number
  /** Chapitres publiés à part (série de chapitres). */
  chapterCount: number
}

export type ReadActionKind = 'read' | 'resume' | 'reread'

export interface ReadAction {
  kind: ReadActionKind
  /** Progression arrondie, de 0 à 100 (pertinente pour « Reprendre à N % »). */
  percent: number
}

/** Une ligne de la liste des volumes : un volume présent, ou un trou dans la numérotation. */
export type VolumeRow =
  { kind: 'volume'; work: Work; number?: number } | { kind: 'gap'; numbers: number[] }

export interface SeriesSummary {
  /** Ce qui est compté : volumes ou chapitres. */
  unit: SeriesView
  total: number
  finished: number
  /** Progression moyenne des volumes (ou chapitres), de 0 à 1. */
  progress: number
}

/**
 * Une ligne de la liste des chapitres d'une série : intitulé de volume (regroupement), chapitre,
 * ou suite de chapitres manquants (`from` à `to`, `count` numéros).
 */
export type SeriesChapterRow =
  | { kind: 'group'; key: string; volume?: number; count: number }
  | {
      kind: 'chapter'
      key: string
      work: Work
      number: number
      title?: string
      state: ChapterState
    }
  | { kind: 'gap'; key: string; from: number; to: number; count: number }
