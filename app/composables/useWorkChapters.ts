import type { Work } from '~/types/core'
import type { ReaderTocEntry } from '~/types/reader'
import { buildChapterRows, currentChapter, sectionFractionsOf } from '~/utils/chapters'

export type ChaptersState = 'idle' | 'loading' | 'ready' | 'none'

/**
 * Chapitres d'un EPUB pour sa fiche : le livre est ouvert par foliate hors du lecteur (modules
 * chargés à la demande), son sommaire normalisé comme dans le lecteur (`loadEpubToc` : notes à
 * part, reconstruction depuis le spine), puis croisé avec la progression de l'œuvre.
 * Les autres formats n'ont pas (encore) de chapitres : état `none`.
 */
export function useWorkChapters(work: MaybeRefOrGetter<Work | null | undefined>) {
  const core = useCore()
  const { t } = useI18n()
  const state = ref<ChaptersState>('idle')
  const entries = shallowRef<ReaderTocEntry[]>([])
  const fractions = shallowRef<number[]>([])
  let run = 0

  async function load(target: Work) {
    const current = ++run
    state.value = 'loading'
    try {
      const [bytes, { makeBook }, { loadEpubToc }] = await Promise.all([
        core.getBookBytes(target.id),
        import('~/vendor/foliate-js/view.js'),
        import('~/composables/useEpubToc'),
      ])
      const file = new File([bytes as Uint8Array<ArrayBuffer>], `${target.id}.epub`, {
        type: 'application/epub+zip',
      })
      const book = await makeBook(file)
      const toc = await loadEpubToc(
        book,
        { notes: t('reader.toc.notes'), section: (n) => t('reader.toc.section', { n }) },
        () => current !== run,
      )
      if (current !== run) return
      entries.value = toc.entries
      fractions.value = sectionFractionsOf(book.sections)
      state.value = toc.entries.length ? 'ready' : 'none'
    } catch {
      if (current === run) state.value = 'none'
    }
  }

  // Recharge seulement quand l'œuvre change (pas à chaque mise à jour de sa progression).
  watch(
    () => {
      const w = toValue(work)
      return w ? `${w.id}:${w.format}` : null
    },
    () => {
      const w = toValue(work)
      run++
      entries.value = []
      if (w?.format === 'epub') void load(w)
      else state.value = w ? 'none' : 'idle'
    },
    { immediate: true },
  )
  onScopeDispose(() => run++)

  const rows = computed(() =>
    buildChapterRows(entries.value, fractions.value, toValue(work)?.progress ?? 0),
  )
  const current = computed(() => currentChapter(rows.value))
  const count = computed(() => rows.value.filter((r) => r.kind === 'chapter').length)

  return { state: readonly(state), rows, current, count }
}
