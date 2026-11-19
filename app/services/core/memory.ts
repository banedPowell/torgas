import type { CoreBridge } from './bridge'
import type {
  Bookmark,
  FileFormat,
  ImportResult,
  Locator,
  ReadingDirection,
  ReadingStatus,
  Series,
  Work,
} from '~/types/core'
import { statusAfterProgress } from './status'

interface Session {
  id: string
  workId: string
  startedAt: string
  endedAt?: string
  minutes?: number
  progress?: number
}

const FORMATS: Record<string, FileFormat> = { epub: 'epub', cbz: 'cbz' }

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes as Uint8Array<ArrayBuffer>)
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}

function titleFromName(name: string): string {
  return name.replace(/\.[^.]+$/, '').trim() || name
}

/**
 * Implémentation en mémoire du cœur, pour les tests Vitest et le développement de l'interface.
 * Rien n'est persisté : tout disparaît au rechargement.
 */
export class MemoryBridge implements CoreBridge {
  private works = new Map<string, Work>()
  private series = new Map<string, Series>()
  private files = new Map<string, Uint8Array>()
  private locators = new Map<string, Locator>()
  private bookmarks = new Map<string, Bookmark>()
  private sessions = new Map<string, Session>()
  private pages = new Map<string, string[]>()

  /** `pages` : URL des pages CBZ par œuvre (images générées pour les tests et le développement). */
  constructor(seed: { works?: Work[]; series?: Series[]; pages?: Record<string, string[]> } = {}) {
    for (const s of seed.series ?? []) this.series.set(s.id, { ...s })
    for (const w of seed.works ?? []) this.works.set(w.id, { ...w, authors: [...w.authors] })
    for (const [id, urls] of Object.entries(seed.pages ?? {})) this.pages.set(id, [...urls])
  }

  async init(): Promise<void> {}

  async importFile(name: string, bytes: Uint8Array): Promise<ImportResult> {
    const ext = name.split('.').pop()?.toLowerCase() ?? ''
    const format = FORMATS[ext]
    if (!format) return { status: 'unsupported', message: name }

    const sha256 = await sha256Hex(bytes)
    const existing = [...this.works.values()].find((w) => w.sha256 === sha256)
    if (existing) return { status: 'duplicate', work: { ...existing } }

    const work: Work = {
      id: crypto.randomUUID(),
      title: titleFromName(name),
      authors: [],
      kind: format === 'cbz' ? 'comic' : 'novel',
      format,
      sha256,
      sizeBytes: bytes.byteLength,
      addedAt: new Date().toISOString(),
      status: 'to_read',
      progress: 0,
    }
    this.works.set(work.id, work)
    this.files.set(work.id, bytes)
    return { status: 'imported', work: { ...work } }
  }

  async listWorks(): Promise<Work[]> {
    return [...this.works.values()].map((w) => ({ ...w }))
  }

  async getWork(id: string): Promise<Work | null> {
    const work = this.works.get(id)
    return work ? { ...work } : null
  }

  async listSeries(): Promise<Series[]> {
    return [...this.series.values()].map((s) => ({ ...s }))
  }

  async setStatus(id: string, status: ReadingStatus): Promise<void> {
    const work = this.requireWork(id)
    work.status = status
  }

  async setSeriesDirection(seriesId: string, direction: ReadingDirection): Promise<void> {
    const series = this.series.get(seriesId)
    if (!series) throw new Error(`Série inconnue : ${seriesId}`)
    series.direction = direction
  }

  async getBookBytes(id: string): Promise<Uint8Array> {
    const bytes = this.files.get(id)
    if (!bytes) throw new Error(`Fichier absent : ${id}`)
    return bytes
  }

  async getPageUrl(id: string, page: number): Promise<string> {
    this.requireWork(id)
    const url = this.pages.get(id)?.[page]
    if (url === undefined) throw new Error(`Page non disponible en mémoire (${id}, page ${page})`)
    return url
  }

  async getLocator(id: string): Promise<Locator | null> {
    const locator = this.locators.get(id)
    return locator ? { ...locator } : null
  }

  async saveLocator(id: string, locator: Locator): Promise<void> {
    const work = this.requireWork(id)
    this.locators.set(id, { ...locator })
    work.progress = locator.progress
    work.status = statusAfterProgress(work.status, locator.progress)
    work.lastReadAt = new Date().toISOString()
  }

  async listBookmarks(id: string): Promise<Bookmark[]> {
    return [...this.bookmarks.values()].filter((b) => b.workId === id).map((b) => ({ ...b }))
  }

  async addBookmark(id: string, locator: Locator, label: string): Promise<Bookmark> {
    this.requireWork(id)
    const bookmark: Bookmark = {
      id: crypto.randomUUID(),
      workId: id,
      locator: { ...locator },
      label,
      createdAt: new Date().toISOString(),
    }
    this.bookmarks.set(bookmark.id, bookmark)
    return { ...bookmark }
  }

  async removeBookmark(bookmarkId: string): Promise<void> {
    this.bookmarks.delete(bookmarkId)
  }

  async startSession(workId: string): Promise<string> {
    this.requireWork(workId)
    const id = crypto.randomUUID()
    this.sessions.set(id, { id, workId, startedAt: new Date().toISOString() })
    return id
  }

  async endSession(sessionId: string, minutes: number, progress: number): Promise<void> {
    const session = this.sessions.get(sessionId)
    if (!session) throw new Error(`Session inconnue : ${sessionId}`)
    Object.assign(session, { endedAt: new Date().toISOString(), minutes, progress })
  }

  /** Sessions de lecture d'une œuvre (pour les tests : le contrat ne les expose pas). */
  sessionsOf(workId: string): Session[] {
    return [...this.sessions.values()].filter((s) => s.workId === workId).map((s) => ({ ...s }))
  }

  private requireWork(id: string): Work {
    const work = this.works.get(id)
    if (!work) throw new Error(`Œuvre inconnue : ${id}`)
    return work
  }
}
