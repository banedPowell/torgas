import { convertFileSrc, invoke } from '@tauri-apps/api/core'
import type { CoreBridge } from './bridge'
import type {
  Bookmark,
  ImportResult,
  Locator,
  ReadingDirection,
  ReadingStatus,
  Series,
  VolumeChapter,
  Work,
} from '~/types/core'
import { createSerialQueue } from '~/utils/serial'

/** Schéma du protocole custom servi par `src-tauri/src/protocol.rs`. */
const SCHEME = 'torgas'
/** Préfixe des URL de couverture enregistrées en base par le cœur desktop. */
const STORED_PREFIX = `${SCHEME}://`

/** Erreur renvoyée par une commande Rust : `{ code, message }` (voir `src-tauri/src/error.rs`). */
export class TauriCoreError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'TauriCoreError'
  }
}

function toError(error: unknown): Error {
  if (error instanceof Error) return error
  if (error && typeof error === 'object' && 'message' in error) {
    const { code, message } = error as { code?: unknown; message: unknown }
    return new TauriCoreError(String(code ?? 'core'), String(message))
  }
  return new Error(String(error))
}

async function call<T>(
  command: string,
  args?: Parameters<typeof invoke>[1],
  options?: Parameters<typeof invoke>[2],
): Promise<T> {
  try {
    return await invoke<T>(command, args, options)
  } catch (error) {
    throw toError(error)
  }
}

/**
 * URL du protocole `torgas://` pour un chemin (`page/<id>/<n>`, `cover/<sha256>`).
 * `convertFileSrc` choisit la forme de la plateforme : `torgas://localhost/…` (macOS, Linux) ou
 * `http://torgas.localhost/…` (Windows).
 */
export function torgasUrl(path: string): string {
  return convertFileSrc(path, SCHEME)
}

/** Couverture enregistrée (`torgas://cover/<sha256>`) → URL chargeable par la webview. */
function withCoverUrl(work: Work): Work {
  const stored = work.coverUrl
  if (!stored?.startsWith(STORED_PREFIX)) return work
  return { ...work, coverUrl: torgasUrl(stored.slice(STORED_PREFIX.length)) }
}

function toBytes(buffer: ArrayBuffer | Uint8Array | number[]): Uint8Array {
  if (buffer instanceof Uint8Array) return buffer
  return new Uint8Array(buffer)
}

/**
 * Cœur de la version desktop : commandes Rust (`src-tauri/src/commands.rs`) via `invoke`, fichiers
 * dans `~/Torgas/`, SQLite natif. Les octets voyagent en binaire brut (import, lecture d'un
 * livre) ; les pages CBZ et les couvertures passent par le protocole `torgas://`, hors IPC.
 *
 * Les commandes Rust sont asynchrones (`spawn_blocking`) : deux `invoke` successifs peuvent
 * s'exécuter dans le désordre. Les opérations sur la bibliothèque passent donc par une file,
 * dans l'ordre d'appel, pour qu'une lecture suive toujours l'écriture appelée avant elle (#29).
 */
export class TauriBridge implements CoreBridge {
  private readonly queue = createSerialQueue()

  /** Commande sur la bibliothèque, exécutée après celles appelées avant elle. */
  private ordered<T>(
    command: string,
    args?: Parameters<typeof invoke>[1],
    options?: Parameters<typeof invoke>[2],
  ): Promise<T> {
    return this.queue.run(() => call<T>(command, args, options))
  }

  async init(): Promise<void> {}

  async importFile(name: string, bytes: Uint8Array): Promise<ImportResult> {
    const result = await this.ordered<ImportResult>('import_file', bytes, {
      headers: { 'X-Torgas-Name': encodeURIComponent(name) },
    })
    return result.work ? { ...result, work: withCoverUrl(result.work) } : result
  }

  async listWorks(): Promise<Work[]> {
    return (await this.ordered<Work[]>('list_works')).map(withCoverUrl)
  }

  async getWork(id: string): Promise<Work | null> {
    const work = await this.ordered<Work | null>('get_work', { id })
    return work ? withCoverUrl(work) : null
  }

  listSeries(): Promise<Series[]> {
    return this.ordered('list_series')
  }

  setStatus(id: string, status: ReadingStatus): Promise<void> {
    return this.ordered('set_status', { id, status })
  }

  setSeriesDirection(seriesId: string, direction: ReadingDirection): Promise<void> {
    return this.ordered('set_series_direction', { seriesId, direction })
  }

  async deleteWorks(ids: string[]): Promise<void> {
    if (ids.length) await this.ordered('delete_works', { ids })
  }

  async getBookBytes(id: string): Promise<Uint8Array> {
    return toBytes(await call<ArrayBuffer>('get_book_bytes', { id }))
  }

  getPageCount(id: string): Promise<number> {
    return this.ordered('get_page_count', { id })
  }

  getVolumeChapters(id: string): Promise<VolumeChapter[]> {
    return this.ordered('get_volume_chapters', { id })
  }

  async getPageUrl(id: string, page: number): Promise<string> {
    return torgasUrl(`page/${id}/${page}`)
  }

  getLocator(id: string): Promise<Locator | null> {
    return this.ordered('get_locator', { id })
  }

  saveLocator(id: string, locator: Locator): Promise<void> {
    return this.ordered('save_locator', { id, locator })
  }

  listBookmarks(id: string): Promise<Bookmark[]> {
    return this.ordered('list_bookmarks', { id })
  }

  addBookmark(id: string, locator: Locator, label: string): Promise<Bookmark> {
    return this.ordered('add_bookmark', { id, locator, label })
  }

  removeBookmark(bookmarkId: string): Promise<void> {
    return this.ordered('remove_bookmark', { bookmarkId })
  }

  startSession(workId: string): Promise<string> {
    return this.ordered('start_session', { workId })
  }

  endSession(sessionId: string, minutes: number, progress: number): Promise<void> {
    return this.ordered('end_session', { sessionId, minutes, progress })
  }
}

/** Fichier ouvert par le système ou déposé sur la fenêtre (`src-tauri/src/files.rs`). */
export interface OpenedFile {
  path: string
  name: string
  sizeBytes: number
}

/** Événement émis par Rust quand des fichiers attendent d'être importés. */
export const OPENED_FILES_EVENT = 'torgas:opened-files'

/** Récupère (et vide) la file des fichiers ouverts ou déposés. */
export function takeOpenedFiles(): Promise<OpenedFile[]> {
  return call('take_opened_files')
}

/** Lit un fichier ouvert ou déposé (une seule lecture autorisée par fichier). */
export async function readOpenedFile(file: OpenedFile): Promise<File> {
  const buffer = await call<ArrayBuffer>('read_opened_file', { path: file.path })
  return new File([toBytes(buffer) as Uint8Array<ArrayBuffer>], file.name)
}
