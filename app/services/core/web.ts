import type { CbzArchive } from 'torgas-wasm'
import type { CoreBridge } from './bridge'
import { DbClient } from './web/db-client'
import type { Migration, Row, SqlValue } from './web/protocol'
import * as Sql from './web/sql'
import { importErrorStatus, loadWasm, type CoreWasm } from './web/wasm'
import type {
  Analysis,
  Bookmark,
  ImportResult,
  Locator,
  Page,
  ReadingDirection,
  ReadingStatus,
  Series,
  Work,
} from '~/types/core'
import { LruCache } from '~/utils/lru'
import { createSerialQueue } from '~/utils/serial'
import { uuidv7 } from '~/utils/uuid'

/** Largeur maximale des miniatures de couverture (pixels). */
const COVER_WIDTH = 360
/** Archives CBZ gardées ouvertes (mémoire wasm) : l'œuvre lue et la précédente. */
const OPEN_ARCHIVES = 2
/** Pages gardées en blob URL : affichage simple ou double, préchargement et retour arrière. */
const PAGE_URLS = 24

function now(): string {
  return new Date().toISOString()
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function notFound(kind: string, id: string): Error {
  return new Error(`${kind} introuvable : ${id}`)
}

async function readOpfsFile(path: string): Promise<File> {
  let dir = await navigator.storage.getDirectory()
  const parts = path.split('/')
  const name = parts.pop()!
  for (const part of parts) dir = await dir.getDirectoryHandle(part)
  return (await dir.getFileHandle(name)).getFile()
}

/**
 * Cœur de la version web : analyse par `torgas-wasm`, fichiers dans l'OPFS
 * (`books/<sha256>.<ext>`, `covers/<sha256>.jpg`) et bibliothèque SQLite (wa-sqlite) dans un
 * worker. Mêmes sémantiques que `Library` côté Rust (`crates/torgas-core/src/db.rs`).
 */
export class WebBridge implements CoreBridge {
  private wasm!: CoreWasm
  private db!: DbClient
  private persistRequested = false
  /**
   * Opérations sur la bibliothèque, une par une dans l'ordre d'appel. Le worker traite ses
   * messages dans l'ordre, mais une opération en envoie souvent plusieurs (`saveLocator` :
   * vérifier l'œuvre puis écrire) : sans cette file, une lecture appelée après une écriture
   * pourrait passer entre ses messages et renvoyer l'état d'avant (#29).
   */
  private readonly queue = createSerialQueue()
  /** Blob URL des couvertures, par chemin OPFS. */
  private readonly covers = new Map<string, Promise<string | undefined>>()
  private readonly archives = new LruCache<string, Promise<CbzArchive>>(OPEN_ARCHIVES, (archive) =>
    archive.then((a) => a.free()).catch(() => {}),
  )
  private readonly pageUrls = new LruCache<string, Promise<string>>(PAGE_URLS, (url) =>
    url.then((u) => URL.revokeObjectURL(u)).catch(() => {}),
  )

  async init(): Promise<void> {
    this.db = new DbClient()
    this.wasm = await loadWasm()
    await this.db.init(
      this.wasm.schemaSql(),
      this.wasm.schemaVersion(),
      this.wasm.migrations() as Migration[],
    )
  }

  async importFile(name: string, bytes: Uint8Array): Promise<ImportResult> {
    let analysis: Analysis
    try {
      analysis = this.wasm.analyze(name, bytes) as Analysis
    } catch (error) {
      const message = errorMessage(error)
      return { status: importErrorStatus(message), message }
    }
    if (analysis.drm) return { status: 'drm' }
    return this.queue.run(() => this.store(analysis, bytes))
  }

  listWorks(): Promise<Work[]> {
    return this.queue.run(() => this.queryWorks(Sql.LIST_WORKS))
  }

  getWork(id: string): Promise<Work | null> {
    return this.queue.run(() => this.findWork(id))
  }

  listSeries(): Promise<Series[]> {
    return this.queue.run(async () => (await this.db.query(Sql.LIST_SERIES)).map(Sql.seriesFromRow))
  }

  setStatus(id: string, status: ReadingStatus): Promise<void> {
    return this.queue.run(async () => {
      const rows = await this.db.query(Sql.SET_STATUS, [id, status, now()])
      if (rows.length === 0) throw notFound('œuvre', id)
    })
  }

  setSeriesDirection(seriesId: string, direction: ReadingDirection): Promise<void> {
    return this.queue.run(async () => {
      const rows = await this.db.query(Sql.SET_SERIES_DIRECTION, [seriesId, direction])
      if (rows.length === 0) throw notFound('série', seriesId)
    })
  }

  async deleteWorks(ids: string[]): Promise<void> {
    if (!ids.length) return
    await this.queue.run(async () => {
      const param = JSON.stringify(ids)
      const files = await this.db.query(Sql.DELETED_FILES, [param])
      await this.db.batch([
        { sql: Sql.DELETE_WORKS, params: [param] },
        { sql: Sql.DELETE_EMPTY_SERIES },
      ])
      // La base fait foi : un fichier OPFS qui résiste n'annule pas la suppression.
      for (const id of ids) this.forgetWork(id)
      const paths = files.flatMap((row) => [row.path, row.cover_url])
      await Promise.all(
        paths.map((path) => {
          if (typeof path !== 'string' || !path) return undefined
          this.forgetCover(path)
          return this.db.removeFile(path).catch(() => {})
        }),
      )
    })
  }

  async getBookBytes(id: string): Promise<Uint8Array> {
    const file = await readOpfsFile(await this.queue.run(() => this.filePath(id)))
    return new Uint8Array(await file.arrayBuffer())
  }

  async getPageCount(id: string): Promise<number> {
    return (await this.openArchive(id)).pageCount()
  }

  getPageUrl(id: string, page: number): Promise<string> {
    const key = `${id}:${page}`
    let url = this.pageUrls.get(key)
    if (!url) {
      url = this.openArchive(id).then((archive) => {
        const { mime, bytes } = archive.page(page) as Page
        return URL.createObjectURL(new Blob([bytes as Uint8Array<ArrayBuffer>], { type: mime }))
      })
      // Une page en échec n'est pas gardée : un nouvel essai relira l'archive.
      url.catch(() => this.pageUrls.get(key) === url && this.pageUrls.delete(key))
      this.pageUrls.set(key, url)
    }
    return url
  }

  getLocator(id: string): Promise<Locator | null> {
    return this.queue.run(async () => {
      const row = await this.db.first(Sql.GET_LOCATOR, [id])
      return row ? Sql.locatorFromRow(row) : null
    })
  }

  saveLocator(id: string, locator: Locator): Promise<void> {
    return this.queue.run(async () => {
      Sql.checkFraction('progression', locator.progress)
      await this.requireWork(id)
      const at = now()
      await this.db.batch([
        { sql: Sql.UPSERT_LOCATOR, params: [id, ...locatorParams(locator), at] },
        { sql: Sql.UPDATE_PROGRESS, params: [id, locator.progress, at] },
      ])
    })
  }

  listBookmarks(id: string): Promise<Bookmark[]> {
    return this.queue.run(async () =>
      (await this.db.query(Sql.LIST_BOOKMARKS, [id])).map(Sql.bookmarkFromRow),
    )
  }

  addBookmark(id: string, locator: Locator, label: string): Promise<Bookmark> {
    return this.queue.run(async () => {
      Sql.checkFraction('progression', locator.progress)
      await this.requireWork(id)
      const bookmark: Bookmark = {
        id: uuidv7(),
        workId: id,
        locator: { ...locator },
        label: label.trim(),
        createdAt: now(),
      }
      await this.db.query(Sql.INSERT_BOOKMARK, [
        bookmark.id,
        id,
        ...locatorParams(locator),
        bookmark.label,
        bookmark.createdAt,
      ])
      return bookmark
    })
  }

  removeBookmark(bookmarkId: string): Promise<void> {
    return this.queue.run(async () => {
      const rows = await this.db.query(Sql.REMOVE_BOOKMARK, [bookmarkId])
      if (rows.length === 0) throw notFound('marque-page', bookmarkId)
    })
  }

  startSession(workId: string): Promise<string> {
    return this.queue.run(async () => {
      const work = await this.requireWork(workId)
      const id = uuidv7()
      await this.db.query(Sql.START_SESSION, [id, workId, now(), work.progress])
      return id
    })
  }

  endSession(sessionId: string, minutes: number, progress: number): Promise<void> {
    return this.queue.run(async () => {
      if (!Number.isFinite(minutes) || minutes < 0) {
        throw new Error(`minutes invalides : ${minutes}`)
      }
      Sql.checkFraction('progression', progress)
      const rows = await this.db.query(Sql.END_SESSION, [sessionId, now(), minutes, progress])
      if (rows.length === 0) throw notFound('session', sessionId)
    })
  }

  /** Enregistre un fichier analysé (dans la file : vérification du doublon puis insertion). */
  private async store(analysis: Analysis, bytes: Uint8Array): Promise<ImportResult> {
    const existing = await this.findBySha256(analysis.sha256)
    if (existing) return { status: 'duplicate', work: existing }

    this.requestPersistence()
    const bookPath = `books/${analysis.sha256}.${analysis.format}`
    const coverPath = analysis.cover ? `covers/${analysis.sha256}.jpg` : undefined
    const workId = uuidv7()
    try {
      await this.db.writeFile(bookPath, bytes)
      const storedCover = coverPath && (await this.writeCover(coverPath, analysis.cover!))
      const series = await this.seriesFor(analysis.seriesTitle)
      await this.db.batch(
        this.insertStatements(workId, analysis, bookPath, storedCover || null, series),
      )
    } catch (error) {
      // Import concurrent (autre onglet) du même fichier : c'est un doublon, pas une erreur.
      const duplicate = await this.findBySha256(analysis.sha256).catch(() => null)
      if (duplicate) return { status: 'duplicate', work: duplicate }
      await Promise.all(
        [bookPath, coverPath].map((p) => p && this.db.removeFile(p).catch(() => {})),
      )
      return { status: 'error', message: errorMessage(error) }
    }
    return { status: 'imported', work: await this.requireWork(workId) }
  }

  /**
   * Série de l'œuvre : une série existante de même clé (`seriesKey` du cœur : casse, accents
   * et ponctuation ignorés, comme `import_analysis` côté Rust), sinon une nouvelle à créer.
   */
  private async seriesFor(title: string | undefined): Promise<SeriesPlacement | null> {
    const trimmed = title?.trim()
    if (!trimmed) return null
    const key = this.wasm.seriesKey(trimmed)
    const rows = await this.db.query(Sql.LIST_SERIES)
    const found = rows.find((row) => this.wasm.seriesKey(String(row.title)) === key)
    return found
      ? { id: String(found.id), created: false }
      : { id: uuidv7(), created: true, title: trimmed }
  }

  private insertStatements(
    workId: string,
    analysis: Analysis,
    bookPath: string,
    coverPath: string | null,
    series: SeriesPlacement | null,
  ) {
    const at = now()
    const statements: { sql: string; params: SqlValue[] }[] = []
    if (series?.created) {
      const direction = analysis.direction ?? 'ltr'
      statements.push({ sql: Sql.INSERT_SERIES, params: [series.id, series.title!, direction, at] })
    }
    statements.push(
      {
        sql: Sql.INSERT_WORK,
        params: [
          workId,
          analysis.title,
          JSON.stringify(analysis.authors),
          analysis.kind,
          analysis.language ?? null,
          coverPath,
          series?.id ?? null,
          analysis.volume ?? null,
          analysis.pageCount ?? null,
          at,
          analysis.chapter ?? null,
          analysis.chapterTitle ?? null,
        ],
      },
      {
        sql: Sql.INSERT_FILE,
        params: [
          uuidv7(),
          workId,
          analysis.format,
          analysis.sha256,
          analysis.sizeBytes,
          bookPath,
          at,
        ],
      },
      { sql: Sql.INSERT_ENTRY, params: [workId, at] },
    )
    return statements
  }

  /** Écrit la miniature ; renvoie son chemin, ou `undefined` si l'image n'est pas décodable. */
  private async writeCover(path: string, cover: Page): Promise<string | undefined> {
    let thumbnail: Page
    try {
      thumbnail = this.wasm.thumbnail(cover.bytes, COVER_WIDTH) as Page
    } catch {
      return undefined // AVIF ou image corrompue : pas de couverture, l'import continue.
    }
    this.forgetCover(path)
    await this.db.writeFile(path, thumbnail.bytes)
    return path
  }

  /** Libère l'archive ouverte et révoque les blob URL des pages d'une œuvre supprimée. */
  private forgetWork(id: string): void {
    this.archives.delete(id)
    this.pageUrls.deleteWhere((key) => key.startsWith(`${id}:`))
  }

  private forgetCover(path: string): void {
    const previous = this.covers.get(path)
    this.covers.delete(path)
    previous?.then((url) => url && URL.revokeObjectURL(url))
  }

  private resolveCover(path: string | undefined): Promise<string | undefined> {
    if (!path) return Promise.resolve(undefined)
    let url = this.covers.get(path)
    if (!url) {
      url = readOpfsFile(path).then(
        (file) => URL.createObjectURL(file),
        () => undefined, // fichier absent (OPFS vidé) : pas de couverture
      )
      this.covers.set(path, url)
    }
    return url
  }

  private async queryWorks(sql: string, params?: SqlValue[]): Promise<Work[]> {
    const rows = await this.db.query(sql, params)
    return Promise.all(rows.map((row) => this.toWork(row)))
  }

  private async toWork(row: Row): Promise<Work> {
    const { coverPath, ...work } = Sql.workFromRow(row)
    const coverUrl = await this.resolveCover(coverPath)
    return coverUrl ? { ...work, coverUrl } : work
  }

  private async findBySha256(sha256: string): Promise<Work | null> {
    return (await this.queryWorks(Sql.FIND_BY_SHA256, [sha256]))[0] ?? null
  }

  private async findWork(id: string): Promise<Work | null> {
    return (await this.queryWorks(Sql.GET_WORK, [id]))[0] ?? null
  }

  private async requireWork(id: string): Promise<Work> {
    const work = await this.findWork(id)
    if (!work) throw notFound('œuvre', id)
    return work
  }

  private async filePath(id: string): Promise<string> {
    const row = await this.db.first(Sql.FILE_PATH, [id])
    if (!row?.path) throw notFound('fichier', id)
    return String(row.path)
  }

  private openArchive(id: string): Promise<CbzArchive> {
    let archive = this.archives.get(id)
    if (!archive) {
      archive = this.getBookBytes(id).then((bytes) => new this.wasm.CbzArchive(bytes))
      archive.catch(() => this.archives.get(id) === archive && this.archives.delete(id))
      this.archives.set(id, archive)
    }
    return archive
  }

  /** Demande un stockage persistant (pas d'éviction automatique de l'OPFS) au premier import. */
  private requestPersistence(): void {
    if (this.persistRequested) return
    this.persistRequested = true
    navigator.storage.persist?.().catch(() => {})
  }
}

/** Série d'une œuvre importée : existante, ou à créer avec ce titre. */
interface SeriesPlacement {
  id: string
  created: boolean
  title?: string
}

function locatorParams(locator: Locator): SqlValue[] {
  return [locator.format, locator.cfi ?? null, locator.page ?? null, locator.progress]
}
