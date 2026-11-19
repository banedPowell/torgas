import type { ReadingDirection, Work } from '~/types/core'
import { tapZone } from './reader'

/** Mise en page effective du lecteur manga. */
export type ComicLayout = 'single' | 'double' | 'webtoon'
/** Préférence de mise en page : `auto` choisit simple ou double selon l'écran. */
export type ComicLayoutPreference = 'auto' | ComicLayout
/** Ajustement de l'image : à la largeur, à la hauteur ou à l'écran entier. */
export type ComicFit = 'width' | 'height' | 'screen'
/** Côté d'une action (tap, touche fléchée, glissement). */
export type ComicSide = 'left' | 'right'
/** Zone de tap sur la page. */
export type ComicTapAction = 'prev' | 'next' | 'menu'

/** Largeur minimale (en px, en paysage) pour passer automatiquement en double page. */
export const COMIC_DOUBLE_MIN_WIDTH = 1024
/** Nombre de pages préchargées après la page courante. */
export const COMIC_PRELOAD_AHEAD = 3
/** Nombre de pages gardées en mémoire avant la page courante. */
export const COMIC_KEEP_BEHIND = 1

/** Mise en page effective selon la préférence et la taille de la fenêtre. */
export function resolveComicLayout(
  preference: ComicLayoutPreference,
  viewport: { width: number; height: number },
): ComicLayout {
  if (preference !== 'auto') return preference
  const landscape = viewport.width > viewport.height
  return landscape && viewport.width >= COMIC_DOUBLE_MIN_WIDTH ? 'double' : 'single'
}

/** Ramène une page (à partir de 0) dans les bornes du volume. */
export function clampComicPage(page: number, pageCount: number): number {
  if (pageCount <= 0 || !Number.isFinite(page)) return 0
  return Math.min(Math.max(Math.trunc(page), 0), pageCount - 1)
}

/**
 * Découpe le volume en planches affichées ensemble (pages à partir de 0).
 * En double page, la couverture reste seule, puis les pages vont par deux.
 */
export function buildComicSpreads(pageCount: number, layout: ComicLayout): number[][] {
  const count = Math.max(0, Math.trunc(pageCount))
  if (layout !== 'double') return Array.from({ length: count }, (_, i) => [i])
  const spreads: number[][] = count > 0 ? [[0]] : []
  for (let i = 1; i < count; i += 2) spreads.push(i + 1 < count ? [i, i + 1] : [i])
  return spreads
}

/** Index de la planche qui contient la page donnée (0 si absente). */
export function spreadIndexOf(spreads: readonly number[][], page: number): number {
  const index = spreads.findIndex((spread) => spread.includes(page))
  return index === -1 ? 0 : index
}

/** Ordre d'affichage d'une planche, de gauche à droite : inversé en lecture droite → gauche. */
export function spreadDisplayOrder(
  spread: readonly number[],
  direction: ReadingDirection,
): number[] {
  return direction === 'rtl' ? [...spread].reverse() : [...spread]
}

/** Progression (0 à 1) une fois la planche contenant `lastVisiblePage` affichée. */
export function comicProgress(lastVisiblePage: number, pageCount: number): number {
  if (pageCount <= 0) return 0
  return Math.min(Math.max((lastVisiblePage + 1) / pageCount, 0), 1)
}

/** Page à rouvrir à partir d'une progression, quand le locator n'a pas de page. */
export function comicPageFromProgress(progress: number, pageCount: number): number {
  if (pageCount <= 0 || !Number.isFinite(progress)) return 0
  return clampComicPage(Math.ceil(progress * pageCount) - 1, pageCount)
}

/** Sens du déplacement (+1 suivant, -1 précédent) pour une action à gauche ou à droite. */
export function comicStepForSide(side: ComicSide, direction: ReadingDirection): 1 | -1 {
  const forward = direction === 'rtl' ? 'left' : 'right'
  return side === forward ? 1 : -1
}

/**
 * Action d'un tap selon sa position (en pixels) dans la zone de lecture, découpée par `tapZone` :
 * bande du haut et centre → barre, côtés → page voisine selon le sens de lecture.
 */
export function comicTapAction(
  point: { x: number; y: number },
  size: { width: number; height: number },
  direction: ReadingDirection,
): ComicTapAction {
  if (size.width <= 0 || size.height <= 0) return 'menu'
  const zone = tapZone(point.x / size.width, point.y / size.height)
  if (zone === 'menu') return 'menu'
  return comicStepForSide(zone, direction) === 1 ? 'next' : 'prev'
}

/** Pages à précharger après la planche courante. */
export function comicPreloadPages(
  lastVisiblePage: number,
  pageCount: number,
  ahead = COMIC_PRELOAD_AHEAD,
): number[] {
  const pages: number[] = []
  for (let p = lastVisiblePage + 1; p <= lastVisiblePage + ahead && p < pageCount; p++) {
    pages.push(p)
  }
  return pages
}

/** Une page doit-elle rester en mémoire ? Les précédentes au-delà de `COMIC_KEEP_BEHIND` sont libérées. */
export function isComicPageKept(
  page: number,
  firstVisiblePage: number,
  lastVisiblePage: number,
  ahead = COMIC_PRELOAD_AHEAD,
): boolean {
  return page >= firstVisiblePage - COMIC_KEEP_BEHIND && page <= lastVisiblePage + ahead
}

/** Volume suivant de la même série (`volume + 1`), s'il est dans la bibliothèque. */
export function findNextComicVolume(works: readonly Work[], current: Work): Work | undefined {
  if (!current.seriesId || current.volume === undefined) return undefined
  const next = current.volume + 1
  return works.find((w) => w.seriesId === current.seriesId && w.volume === next)
}

/** Fenêtre de miniatures centrée sur la page courante (7 par défaut, comme la maquette). */
export function comicThumbnailWindow(page: number, pageCount: number, size = 7): number[] {
  if (pageCount <= 0) return []
  const length = Math.min(size, pageCount)
  const start = Math.min(Math.max(page - Math.floor(length / 2), 0), pageCount - length)
  return Array.from({ length }, (_, i) => start + i)
}
