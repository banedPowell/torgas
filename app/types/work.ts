import type { FileFormat, Series, Work, WorkKind } from './core'

/** Ce que la fiche affiche : une œuvre seule, ou une série avec ses volumes triés. */
export type WorkTarget =
  { kind: 'work'; work: Work } | { kind: 'series'; series: Series; volumes: Work[] }

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
  volumeCount: number
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
  total: number
  finished: number
  /** Progression moyenne des volumes, de 0 à 1. */
  progress: number
}
