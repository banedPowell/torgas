import type { ReadingStatus } from '~/types/core'

/**
 * Progression à partir de laquelle une œuvre est « terminée » (le dernier écran d'un EPUB
 * n'atteint pas toujours 1). Même valeur que `FINISHED_THRESHOLD` dans `torgas-core`.
 */
export const FINISHED_THRESHOLD = 0.995

/**
 * Statut après l'enregistrement d'une position : même règle que `save_locator` dans
 * `crates/torgas-core/src/db.rs`. Une progression positive passe l'œuvre « en cours »,
 * `FINISHED_THRESHOLD` la passe « terminée » ; une œuvre terminée le reste en cas de relecture.
 * À réutiliser par les bridges écrits en TypeScript (`MemoryBridge`, `WebBridge`).
 */
export function statusAfterProgress(current: ReadingStatus, progress: number): ReadingStatus {
  if (progress >= FINISHED_THRESHOLD) return 'finished'
  if (current === 'finished') return current
  return progress > 0 ? 'reading' : current
}
