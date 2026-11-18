import type {
  Bookmark,
  ImportResult,
  Locator,
  ReadingDirection,
  ReadingStatus,
  Series,
  Work,
} from '~/types/core'

/**
 * Interface unique entre l'app et le cœur.
 * Implémentations : `MemoryBridge` (tests), `WebBridge` (wasm + OPFS), `TauriBridge` (invoke).
 * Aucun composant n'appelle un bridge directement : passer par `useCore()` dans un composable.
 */
export interface CoreBridge {
  init(): Promise<void>
  importFile(name: string, bytes: Uint8Array): Promise<ImportResult>
  listWorks(): Promise<Work[]>
  getWork(id: string): Promise<Work | null>
  listSeries(): Promise<Series[]>
  setStatus(id: string, status: ReadingStatus): Promise<void>
  setSeriesDirection(seriesId: string, direction: ReadingDirection): Promise<void>
  getBookBytes(id: string): Promise<Uint8Array>
  getPageUrl(id: string, page: number): Promise<string>
  getLocator(id: string): Promise<Locator | null>
  saveLocator(id: string, locator: Locator): Promise<void>
  listBookmarks(id: string): Promise<Bookmark[]>
  addBookmark(id: string, locator: Locator, label: string): Promise<Bookmark>
  removeBookmark(bookmarkId: string): Promise<void>
  startSession(workId: string): Promise<string>
  endSession(sessionId: string, minutes: number, progress: number): Promise<void>
}
