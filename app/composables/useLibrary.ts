import type { Series, Work } from '~/types/core'
import type {
  FormatFilter,
  LibraryFilters,
  LibrarySort,
  LibraryView,
  StatusFilter,
} from '~/types/library'
import { buildLibrary, countByStatus, pickResume, VIRTUAL_LIST_THRESHOLD } from '~/utils/library'

export type LoadState = 'idle' | 'loading' | 'ready' | 'error'

/** Bibliothèque : chargement depuis le cœur, tri, filtres et regroupement par série. */
export function useLibrary() {
  const core = useCore()

  // Listes potentiellement longues : shallowRef, on remplace le tableau entier.
  const works = useState('library:works', () => shallowRef<Work[]>([]))
  const series = useState('library:series', () => shallowRef<Series[]>([]))
  const state = useState<LoadState>('library:state', () => 'idle')
  const error = useState<string | null>('library:error', () => null)
  const filters = useState<LibraryFilters>('library:filters', () => ({
    query: '',
    format: 'all',
    status: 'all',
  }))
  const sort = useState<LibrarySort>('library:sort', () => 'lastRead')
  const view = useState<LibraryView>('library:view', () => 'grid')

  const entries = computed(() => buildLibrary(works.value, series.value, filters.value, sort.value))
  const counts = computed(() => countByStatus(works.value))
  const resume = computed(() => pickResume(works.value))
  const isEmpty = computed(() => state.value === 'ready' && works.value.length === 0)
  const hasActiveFilters = computed(
    () =>
      filters.value.query.trim() !== '' ||
      filters.value.format !== 'all' ||
      filters.value.status !== 'all',
  )
  const virtualized = computed(() => entries.value.length > VIRTUAL_LIST_THRESHOLD)

  async function load(): Promise<void> {
    state.value = 'loading'
    error.value = null
    try {
      const [w, s] = await Promise.all([core.listWorks(), core.listSeries()])
      works.value = w
      series.value = s
      state.value = 'ready'
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
      state.value = 'error'
    }
  }

  /** Charge la bibliothèque si ce n'est pas déjà fait. */
  async function ensureLoaded(): Promise<void> {
    if (state.value === 'idle' || state.value === 'error') await load()
  }

  function setQuery(query: string) {
    filters.value = { ...filters.value, query }
  }
  function setFormat(format: FormatFilter) {
    filters.value = { ...filters.value, format }
  }
  function setStatus(status: StatusFilter) {
    filters.value = { ...filters.value, status }
  }
  function resetFilters() {
    filters.value = { query: '', format: 'all', status: 'all' }
  }
  function setSort(value: LibrarySort) {
    sort.value = value
  }
  function setView(value: LibraryView) {
    view.value = value
  }

  return {
    works: readonly(works),
    series: readonly(series),
    state: readonly(state),
    error: readonly(error),
    filters: readonly(filters),
    sort: readonly(sort),
    view: readonly(view),
    entries,
    counts,
    resume,
    isEmpty,
    hasActiveFilters,
    virtualized,
    load,
    ensureLoaded,
    setQuery,
    setFormat,
    setStatus,
    resetFilters,
    setSort,
    setView,
  }
}
