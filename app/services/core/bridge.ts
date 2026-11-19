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
  /**
   * Supprime des œuvres de cet appareil, en une opération (tout ou rien côté base) : fiche,
   * fichier, couverture, position et marque-pages ; les séries restées sans volume aussi.
   * Les sessions de lecture sont gardées (le temps lu reste acquis). Les identifiants inconnus
   * sont ignorés.
   */
  deleteWorks(ids: string[]): Promise<void>
  getBookBytes(id: string): Promise<Uint8Array>
  /**
   * Nombre de pages d'une œuvre lue page par page : CBZ, ou manga EPUB fait de pages-images
   * (0 pour un livre). Sert aux œuvres importées avant que leur nombre de pages soit connu.
   */
  getPageCount(id: string): Promise<number>
  getPageUrl(id: string, page: number): Promise<string>
  /**
   * Chapitres contenus dans un volume lu page par page, retrouvés d'après le nom de ses pages
   * (`109-00.jpg`, dossier « Chapitre 109 ») ; vide si les noms n'en disent rien.
   */
  getVolumeChapters(id: string): Promise<VolumeChapter[]>
  getLocator(id: string): Promise<Locator | null>
  saveLocator(id: string, locator: Locator): Promise<void>
  listBookmarks(id: string): Promise<Bookmark[]>
  addBookmark(id: string, locator: Locator, label: string): Promise<Bookmark>
  removeBookmark(bookmarkId: string): Promise<void>
  startSession(workId: string): Promise<string>
  endSession(sessionId: string, minutes: number, progress: number): Promise<void>
}
