/**
 * Types du contrat entre l'app et le cœur Rust (`torgas-core`).
 *
 * Façade sur les types générés depuis Rust par ts-rs (`crates/torgas-core/bindings/`, alias
 * `#core-bindings`) : Rust fait foi pour la forme des données. Seuls les types propres à
 * l'interface (résultat d'import côté app) sont déclarés ici.
 */
import type { Work } from '#core-bindings/Work'

export type { Analysis } from '#core-bindings/Analysis'
export type { Bookmark } from '#core-bindings/Bookmark'
export type { Format as FileFormat } from '#core-bindings/Format'
export type { ImportOutcome } from '#core-bindings/ImportOutcome'
export type { Locator } from '#core-bindings/Locator'
export type { Page } from '#core-bindings/Page'
export type { ReadingDirection } from '#core-bindings/ReadingDirection'
export type { ReadingSession } from '#core-bindings/ReadingSession'
export type { ReadingStatus } from '#core-bindings/ReadingStatus'
export type { Series } from '#core-bindings/Series'
export type { WorkKind } from '#core-bindings/WorkKind'
export type { Work }

/**
 * Issue d'un import vue par l'app : les deux issues du cœur (`ImportOutcome` : `imported`,
 * `duplicate`) plus les refus constatés avant l'insertion (DRM, format, erreur).
 */
export type ImportStatus = 'imported' | 'duplicate' | 'drm' | 'unsupported' | 'error'

export interface ImportResult {
  status: ImportStatus
  /** Œuvre créée (`imported`) ou déjà présente (`duplicate`). */
  work?: Work
  /** Détail technique (erreur du cœur), en complément du message traduit. */
  message?: string
}
