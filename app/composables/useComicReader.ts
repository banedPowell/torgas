import type { ReadingDirection, Series, Work } from '~/types/core'
import {
  buildComicSpreads,
  clampComicPage,
  comicPageFromProgress,
  comicPreloadPages,
  comicProgress,
  comicStepForSide,
  findNextComic,
  isComicPageKept,
  resolveComicLayout,
  spreadDisplayOrder,
  spreadIndexOf,
  type ComicSide,
} from '~/utils/comic'
import type { LoadState } from './useLibrary'

/** Délai minimal entre deux sauvegardes de la position (ms). */
export const COMIC_SAVE_INTERVAL = 2000

export interface ComicReaderOptions {
  /** Taille de la fenêtre ; par défaut celle du navigateur. */
  viewport?: Ref<{ width: number; height: number }>
}

/**
 * Lecteur manga : page courante, planches simple/double, sens de lecture de la série,
 * préchargement, sauvegarde et reprise de la position. Les pages sont numérotées à partir de 0.
 */
export function useComicReader(work: MaybeRefOrGetter<Work>, options: ComicReaderOptions = {}) {
  const core = useCore()
  const settings = useComicSettings()
  const windowSize = useWindowSize()
  const viewport =
    options.viewport ??
    computed(() => ({ width: windowSize.width.value, height: windowSize.height.value }))

  const workId = computed(() => toValue(work).id)
  // Position : copie locale à chaque page, cœur au plus toutes les 2 s et en quittant le lecteur.
  const saver = useLocatorSaver(workId, { interval: COMIC_SAVE_INTERVAL })
  const state = ref<LoadState>('idle')
  const error = ref<string | null>(null)
  const pageCount = ref(0)
  const series = shallowRef<Series | null>(null)
  /** Suite de la série : volume suivant, ou chapitre suivant si l'œuvre est un chapitre. */
  const nextWork = shallowRef<Work | null>(null)
  const localDirection = ref<ReadingDirection>('ltr')
  const anchor = ref(0)
  const ended = ref(false)

  const direction = computed<ReadingDirection>(
    () => series.value?.direction ?? localDirection.value,
  )
  const layout = computed(() => resolveComicLayout(settings.layout.value, viewport.value))
  const spreads = computed(() =>
    buildComicSpreads(pageCount.value, layout.value === 'double' ? 'double' : 'single'),
  )
  const spreadIndex = computed(() => spreadIndexOf(spreads.value, anchor.value))
  const currentSpread = computed(() => spreads.value[spreadIndex.value] ?? [])
  /** Page affichée (la première de la planche). */
  const page = computed(() => currentSpread.value[0] ?? 0)
  const lastVisiblePage = computed(() => currentSpread.value.at(-1) ?? 0)
  /** Pages de la planche, dans l'ordre d'affichage de gauche à droite. */
  const visiblePages = computed(() => spreadDisplayOrder(currentSpread.value, direction.value))
  const progress = computed(() =>
    ended.value ? 1 : comicProgress(lastVisiblePage.value, pageCount.value),
  )
  const isFirst = computed(() => spreadIndex.value === 0 && !ended.value)

  // --- Pages : URL mémorisées, préchargement et libération -------------------------------
  const urls = new Map<number, Promise<string>>()
  const preloaded = new Map<number, HTMLImageElement>()

  /**
   * URL d'une page, demandée une seule fois au cœur tant qu'elle reste en mémoire.
   * `fresh` la redemande (bouton « Réessayer » après une erreur d'affichage).
   */
  function pageUrl(p: number, fresh = false): Promise<string> {
    if (fresh) invalidatePage(p)
    let url = urls.get(p)
    if (!url) {
      url = core.getPageUrl(workId.value, p)
      urls.set(p, url)
      url.catch(() => urls.delete(p))
    }
    return url
  }

  /** Oublie l'URL d'une page (après une erreur d'affichage) pour la redemander. */
  function invalidatePage(p: number) {
    urls.delete(p)
    preloaded.delete(p)
  }

  function preload() {
    const first = currentSpread.value[0] ?? 0
    const last = lastVisiblePage.value
    for (const p of comicPreloadPages(last, pageCount.value)) {
      if (preloaded.has(p)) continue
      pageUrl(p)
        .then((src) => {
          if (!isComicPageKept(p, page.value, lastVisiblePage.value)) return
          const img = new Image()
          img.decoding = 'async'
          img.src = src
          preloaded.set(p, img)
        })
        .catch(() => {})
    }
    for (const p of [...urls.keys()]) {
      if (!isComicPageKept(p, first, last)) urls.delete(p)
    }
    for (const [p, img] of preloaded) {
      if (isComicPageKept(p, first, last)) continue
      img.src = ''
      preloaded.delete(p)
    }
  }

  // --- Navigation -------------------------------------------------------------------------
  function goTo(p: number) {
    ended.value = false
    anchor.value = clampComicPage(p, pageCount.value)
  }

  function next() {
    if (state.value !== 'ready' || ended.value) return
    const following = spreads.value[spreadIndex.value + 1]
    if (following) anchor.value = following[0]!
    else ended.value = true
  }

  function prev() {
    if (state.value !== 'ready') return
    if (ended.value) {
      ended.value = false
      return
    }
    const previous = spreads.value[spreadIndex.value - 1]
    if (previous) anchor.value = previous[0]!
  }

  /** Action à gauche ou à droite (tap, flèche, glissement) selon le sens de lecture. */
  function goSide(side: ComicSide) {
    if (comicStepForSide(side, direction.value) === 1) next()
    else prev()
  }

  /** Page visible en mode webtoon (rapportée par le défilement). */
  function setVisiblePage(p: number) {
    anchor.value = clampComicPage(p, pageCount.value)
  }

  function setEnded(value: boolean) {
    ended.value = value
  }

  async function setDirection(value: ReadingDirection) {
    const current = series.value
    if (!current) {
      localDirection.value = value
      return
    }
    series.value = { ...current, direction: value }
    try {
      await core.setSeriesDirection(current.id, value)
    } catch (e) {
      series.value = current
      throw e
    }
  }

  function toggleDirection() {
    return setDirection(direction.value === 'rtl' ? 'ltr' : 'rtl')
  }

  // --- Chargement et reprise --------------------------------------------------------------
  async function load(): Promise<void> {
    state.value = 'loading'
    error.value = null
    ended.value = false
    urls.clear()
    preloaded.clear()
    try {
      const id = workId.value
      const [fresh, allSeries, locator, works] = await Promise.all([
        core.getWork(id),
        core.listSeries(),
        core.getLocator(id),
        core.listWorks(),
      ])
      const current = fresh ?? toValue(work)
      const count = current.pageCount ?? 0
      if (count <= 0) throw new Error('empty')
      pageCount.value = count
      series.value = allSeries.find((s) => s.id === current.seriesId) ?? null
      nextWork.value = findNextComic(works, current) ?? null
      const stored = locator?.format === 'cbz' ? locator : null
      const last = await saver.restore(stored, fresh?.lastReadAt)
      const resume = last ? (last.page ?? comicPageFromProgress(last.progress, count)) : 0
      anchor.value = clampComicPage(resume, count)
      state.value = 'ready'
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
      state.value = 'error'
    }
  }

  // --- Sauvegarde de la position ----------------------------------------------------------
  /** Écrit tout de suite la position courante ; se résout une fois enregistrée. */
  function save(): Promise<void> {
    return saver.flush()
  }

  watch([page, ended], () => state.value === 'ready' && preload())
  // Synchrone : une fermeture dans la foulée d'un changement de page enregistre la bonne page.
  watch(
    [page, ended],
    () => {
      if (state.value !== 'ready') return
      saver.track({ format: 'cbz', page: page.value, progress: progress.value })
    },
    { flush: 'sync' },
  )
  watch(state, (value) => value === 'ready' && preload())

  tryOnScopeDispose(() => {
    preloaded.clear()
    urls.clear()
  })

  watch(workId, load, { immediate: true })

  return {
    state: readonly(state),
    error: readonly(error),
    pageCount: readonly(pageCount),
    page,
    visiblePages,
    layout,
    direction,
    series: computed(() => series.value),
    nextWork: computed(() => nextWork.value),
    ended: readonly(ended),
    progress,
    isFirst,
    load,
    goTo,
    next,
    prev,
    goSide,
    setVisiblePage,
    setEnded,
    setDirection,
    toggleDirection,
    pageUrl,
    invalidatePage,
    save,
  }
}
