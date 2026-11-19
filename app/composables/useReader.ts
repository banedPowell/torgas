import type { Bookmark, FileFormat, Locator, Work } from '~/types/core'
import type { ReaderPosition } from '~/types/reader'
import { formatPercent } from '~/utils/format'

/** Intervalle minimal entre deux sauvegardes de la position pendant la lecture. */
export const LOCATOR_SAVE_INTERVAL = 5000

export type ReaderState = 'loading' | 'ready' | 'not-found' | 'error'

const MIME: Record<FileFormat, string> = {
  epub: 'application/epub+zip',
  cbz: 'application/vnd.comicbook+zip',
}

function message(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

/**
 * Lecture d'une œuvre : chargement du fichier et de la dernière position, sauvegarde du
 * locator (au plus toutes les 5 s, puis tout de suite à la mise en arrière-plan, en quittant
 * le lecteur et au démontage, voir `useLocatorSaver`), marque-pages. Le composant de rendu ne
 * fait que relayer le moteur (foliate).
 */
export function useReader(workId: MaybeRefOrGetter<string>) {
  const core = useCore()

  const state = ref<ReaderState>('loading')
  const error = ref<string | null>(null)
  const work = shallowRef<Work | null>(null)
  const file = shallowRef<File | null>(null)
  /** Position à restaurer à l'ouverture (CFI enregistré), ou `null` pour le début. */
  const initialCfi = ref<string | null>(null)
  const position = shallowRef<ReaderPosition | null>(null)
  const bookmarks = shallowRef<Bookmark[]>([])

  const saver = useLocatorSaver(workId, { interval: LOCATOR_SAVE_INTERVAL })

  async function load(): Promise<void> {
    const id = toValue(workId)
    state.value = 'loading'
    error.value = null
    try {
      const found = await core.getWork(id)
      if (!found) {
        state.value = 'not-found'
        return
      }
      const [bytes, locator, marks] = await Promise.all([
        core.getBookBytes(id),
        core.getLocator(id),
        core.listBookmarks(id),
      ])
      const resume = await saver.restore(locator, found.lastReadAt)
      work.value = found
      file.value = new File([bytes as Uint8Array<ArrayBuffer>], `${found.title}.${found.format}`, {
        type: MIME[found.format],
      })
      initialCfi.value = resume?.cfi ?? null
      bookmarks.value = sortBookmarks(marks)
      state.value = 'ready'
    } catch (e) {
      fail(e)
    }
  }

  /** Le fichier n'a pas pu être lu (cœur ou moteur de rendu). */
  function fail(e: unknown): void {
    error.value = message(e)
    state.value = 'error'
  }

  /** Appelé par le moteur à chaque changement de page. */
  function relocate(next: ReaderPosition): void {
    position.value = next
    saver.track({ format: work.value?.format ?? 'epub', cfi: next.cfi, progress: next.progress })
  }

  /** Sauvegarde immédiate de la dernière position connue, résolue une fois enregistrée. */
  const flush = saver.flush

  const currentBookmark = computed(() => {
    const cfi = position.value?.cfi
    return cfi ? bookmarks.value.find((b) => b.locator.cfi === cfi) : undefined
  })

  async function toggleBookmark(): Promise<void> {
    const current = position.value
    if (!current) return
    if (currentBookmark.value) return removeBookmark(currentBookmark.value.id)
    const locator: Locator = {
      format: work.value?.format ?? 'epub',
      cfi: current.cfi,
      progress: current.progress,
    }
    const label = current.chapter || formatPercent(current.progress)
    const added = await core.addBookmark(toValue(workId), locator, label)
    bookmarks.value = sortBookmarks([...bookmarks.value, added])
  }

  async function removeBookmark(bookmarkId: string): Promise<void> {
    await core.removeBookmark(bookmarkId)
    bookmarks.value = bookmarks.value.filter((b) => b.id !== bookmarkId)
  }

  return {
    state: readonly(state),
    error: readonly(error),
    work: computed(() => work.value),
    file: computed(() => file.value),
    initialCfi: readonly(initialCfi),
    position: computed(() => position.value),
    bookmarks: computed(() => bookmarks.value),
    currentBookmark,
    load,
    fail,
    relocate,
    flush,
    toggleBookmark,
    removeBookmark,
  }
}

function sortBookmarks(list: Bookmark[]): Bookmark[] {
  return [...list].sort((a, b) => a.locator.progress - b.locator.progress)
}
