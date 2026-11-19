import type { Work } from '~/types/core'
import { buildSeriesChapterRows, chapterGaps, countMissing } from '~/utils/seriesChapters'

/**
 * Liste des chapitres d'une série sur sa fiche : recherche (numéro ou titre), lignes regroupées
 * par volume, trous de numérotation. Tout est dérivé : rien n'est rechargé du cœur.
 */
export function useSeriesChapters(chapters: MaybeRefOrGetter<readonly Work[]>) {
  const query = ref('')
  const rows = computed(() => buildSeriesChapterRows(toValue(chapters), query.value))
  const gaps = computed(() => chapterGaps(toValue(chapters)))
  const missingCount = computed(() => countMissing(gaps.value))
  /** Nombre de chapitres affichés (tous, ou ceux qui correspondent à la recherche). */
  const shown = computed(() => rows.value.filter((row) => row.kind === 'chapter').length)

  return { query, rows, gaps, missingCount, shown }
}
