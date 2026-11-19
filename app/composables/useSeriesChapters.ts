import type { Work } from '~/types/core'
import type { ChapterFilter, ChapterOrder } from '~/utils/seriesChapters'
import { buildSeriesChapterRows, chapterGaps, countMissing } from '~/utils/seriesChapters'

/**
 * Liste des chapitres d'une série sur sa fiche : recherche (numéro ou titre), tri (du premier
 * au dernier ou l'inverse), filtre par état de lecture, lignes regroupées par volume, trous de
 * numérotation. Tout est dérivé : rien n'est rechargé du cœur.
 */
export function useSeriesChapters(chapters: MaybeRefOrGetter<readonly Work[]>) {
  const query = ref('')
  const order = ref<ChapterOrder>('asc')
  const filter = ref<ChapterFilter>('all')
  const rows = computed(() =>
    buildSeriesChapterRows(toValue(chapters), query.value, {
      order: order.value,
      filter: filter.value,
    }),
  )
  const gaps = computed(() => chapterGaps(toValue(chapters)))
  const missingCount = computed(() => countMissing(gaps.value))
  /** Nombre de chapitres affichés (tous, ou ceux qui correspondent à la recherche et au filtre). */
  const shown = computed(() => rows.value.filter((row) => row.kind === 'chapter').length)
  /** Nombre de chapitres de la série. */
  const total = computed(() => toValue(chapters).length)

  return { query, order, filter, rows, gaps, missingCount, shown, total }
}
