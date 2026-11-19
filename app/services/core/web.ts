import type { CbzArchive } from 'torgas-wasm'
import type { CoreBridge } from './bridge'
import { DbClient } from './web/db-client'
import type { Row, SqlValue } from './web/protocol'
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
    await this.db.init(this.wasm.schemaSql(), this.wasm.schemaVersion())
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
    const existing = await this.findBySha256(analysis.sha256)
    if (existing) return { status: 'duplicate', work: existing }

    this.requestPersistence()
    const bookPath = `books/${analysis.sha256}.${analysis.format}`
    const coverPath = analysis.cover ? `covers/${analysis.sha256}.jpg` : undefined
    const workId = uuidv7()
    try {
      await this.db.writeFile(bookPath, bytes)
      const storedCover = coverPath && (await this.writeCover(coverPath, analysis.cover!))
      await this.db.batch(this.insertStatements(workId, analysis, bookPath, storedCover || null))
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

  async listWorks(): Promise<Work[]> {
    return this.queryWorks(Sql.LIST_WORKS)
  }

  async getWork(id: string): Promise<Work | null> {
    return (await this.queryWorks(Sql.GET_WORK, [id]))[0] ?? null
  }

  async listSeries(): Promise<Series[]> {
    return (await this.db.query(Sql.LIST_SERIES)).map(Sql.seriesFromRow)
  }

  async setStatus(id: string, status: ReadingStatus): Promise<void> {
    const rows = await this.db.query(Sql.SET_STATUS, [id, status, now()])
    if (rows.length === 0) throw notFound('œuvre', id)
  }

  async setSeriesDirection(seriesId: string, direction: ReadingDirection): Promise<void> {
    const rows = await this.db.query(Sql.SET_SERIES_DIRECTION, [seriesId, direction])
    if (rows.length === 0) throw notFound('série', seriesId)
  }

  async getBookBytes(id: string): Promise<Uint8Array> {
    const file = await readOpfsFile(await this.filePath(id))
    return new Uint8Array(await file.arrayBuffer())
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

  async getLocator(id: string): Promise<Locator | null> {
    const row = await this.db.first(Sql.GET_LOCATOR, [id])
    return row ? Sql.locatorFromRow(row) : null
  }

  async saveLocator(id: string, locator: Locator): Promise<void> {
    Sql.checkFraction('progression', locator.progress)
    await this.requireWork(id)
    const at = now()
    await this.db.batch([
      { sql: Sql.UPSERT_LOCATOR, params: [id, ...locatorParams(locator), at] },
      { sql: Sql.UPDATE_PROGRESS, params: [id, locator.progress, at] },
    ])
  }

  async listBookmarks(id: string): Promise<Bookmark[]> {
    return (await this.db.query(Sql.LIST_BOOKMARKS, [id])).map(Sql.bookmarkFromRow)
  }

  async addBookmark(id: string, locator: Locator, label: string): Promise<Bookmark> {
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
  }

  async removeBookmark(bookmarkId: string): Promise<void> {
    const rows = await this.db.query(Sql.REMOVE_BOOKMARK, [bookmarkId])
    if (rows.length === 0) throw notFound('marque-page', bookmarkId)
  }

  async startSession(workId: string): Promise<string> {
    const work = await this.requireWork(workId)
    const id = uuidv7()
    await this.db.query(Sql.START_SESSION, [id, workId, now(), work.progress])
    return id
  }

  async endSession(sessionId: string, minutes: number, progress: number): Promise<void> {
    if (!Number.isFinite(minutes) || minutes < 0) {
      throw new Error(`minutes invalides : ${minutes}`)
    }
    Sql.checkFraction('progression', progress)
    const rows = await this.db.query(Sql.END_SESSION, [sessionId, now(), minutes, progress])
    if (rows.length === 0) throw notFound('session', sessionId)
  }

  private insertStatements(
    workId: string,
    analysis: Analysis,
    bookPath: string,
    coverPath: string | null,
  ) {
    const at = now()
    const seriesTitle = analysis.seriesTitle?.trim() || null
    const statements: { sql: string; params: SqlValue[] }[] = []
    if (seriesTitle) {
      statements.push({ sql: Sql.INSERT_SERIES, params: [uuidv7(), seriesTitle, at] })
    }
    statements.push(
      {
        sql: Sql.INSERT_WORK,
        params: [
          workId,
          analysis.title,
          JSON.stringify(analysis.authors),
          analysis.format === 'cbz' ? 'comic' : 'novel',
          analysis.language ?? null,
          coverPath,
          seriesTitle,
          analysis.volume ?? null,
          analysis.pageCount ?? null,
          at,
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

  private async requireWork(id: string): Promise<Work> {
    const work = await this.getWork(id)
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

function locatorParams(locator: Locator): SqlValue[] {
  return [locator.format, locator.cfi ?? null, locator.page ?? null, locator.progress]
}
