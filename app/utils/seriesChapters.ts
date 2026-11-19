import type { Work } from '~/types/core'
import type { SeriesChapterRow } from '~/types/work'
import type { ChapterState } from './chapters'
import { naturalCompare } from './sort'

/**
 * Chapitres d'une série de mangas : une œuvre dont `chapter` est renseigné (un CBZ par
 * chapitre), rattachée ou non à un volume (`volume`). Fonctions pures, prévues pour plusieurs
 * milliers de chapitres : tri une fois, puis parcours linéaires.
 */

/** L'œuvre est-elle un chapitre (et non un volume entier) ? */
export function isChapter(work: Pick<Work, 'chapter'>): boolean {
  return work.chapter !== undefined && work.chapter !== null
}

/** Sépare les volumes entiers des chapitres d'une série. */
export function splitSeriesWorks(works: readonly Work[]): { volumes: Work[]; chapters: Work[] } {
  const volumes: Work[] = []
  const chapters: Work[] = []
  for (const work of works) (isChapter(work) ? chapters : volumes).push(work)
  return { volumes, chapters }
}

/** Chapitres par numéro croissant (à numéro égal : par volume, puis par titre). */
export function sortChapters(chapters: readonly Work[]): Work[] {
  return [...chapters].sort(
    (a, b) =>
      a.chapter! - b.chapter! ||
      (a.volume ?? Infinity) - (b.volume ?? Infinity) ||
      naturalCompare(a.title, b.title),
  )
}

const numberFormat = new Intl.NumberFormat('fr-FR', {
  maximumFractionDigits: 2,
  useGrouping: false,
})

/** Numéro de chapitre ou de volume à la française : « 1050 », « 1050,5 ». */
export function formatIssueNumber(n: number): string {
  return numberFormat.format(n)
}

/** Lu, en cours ou à lire. */
export function chapterState(work: Pick<Work, 'status' | 'progress'>): ChapterState {
  if (work.status === 'finished' || work.progress >= 1) return 'read'
  return work.progress > 0 ? 'current' : 'unread'
}

/** Prochain chapitre : le premier, dans l'ordre de la série, qui n'est pas terminé. */
export function nextChapter(chapters: readonly Work[]): Work | undefined {
  return sortChapters(chapters).find((c) => chapterState(c) !== 'read')
}

/** Suite de numéros de chapitres manquants, de `from` à `to` inclus. */
export interface ChapterGap {
  from: number
  to: number
  /** Chapitre présent qui suit la suite manquante. */
  beforeId: string
}

/**
 * Trous de numérotation entre le plus petit et le plus grand chapitre présents (seuls les
 * numéros entiers comptent : un 1050,5 ne remplace pas un 1050). Une série commencée au
 * chapitre 1000 (les précédents lus en volumes) n'a donc pas 999 chapitres manquants.
 */
export function chapterGaps(chapters: readonly Work[]): ChapterGap[] {
  const gaps: ChapterGap[] = []
  let previous: number | undefined
  for (const work of sortChapters(chapters)) {
    const n = work.chapter!
    if (previous !== undefined) {
      const from = Math.floor(previous) + 1
      const to = Math.ceil(n) - 1
      if (to >= from) gaps.push({ from, to, beforeId: work.id })
    }
    previous = previous === undefined ? n : Math.max(previous, n)
  }
  return gaps
}

/** Nombre total de chapitres manquants. */
export function countMissing(gaps: readonly ChapterGap[]): number {
  return gaps.reduce((sum, gap) => sum + gap.to - gap.from + 1, 0)
}

function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()
}

/**
 * Le chapitre correspond-il à la recherche ? Un nombre cherche par numéro (« 105 » trouve 105,
 * 1050, 1051… ; « 1050,5 » ou « 1050.5 » le chapitre 1050,5), un texte dans le titre du chapitre.
 */
export function matchesChapterQuery(work: Work, query: string): boolean {
  const q = normalize(query)
  if (!q) return true
  const numeric = q.replace(/^(ch(ap(itre)?)?\.?|c|#)\s*/, '')
  if (/^\d+([.,]\d*)?$/.test(numeric)) {
    return String(work.chapter).startsWith(numeric.replace(',', '.'))
  }
  return !!work.chapterTitle && normalize(work.chapterTitle).includes(q)
}

const NO_VOLUME = 'none'

/** Ordre de la liste des chapitres : du premier au dernier, ou l'inverse. */
export type ChapterOrder = 'asc' | 'desc'
/** Filtre de la liste des chapitres : tous, ou un seul état de lecture. */
export type ChapterFilter = 'all' | ChapterState

export interface ChapterListView {
  order?: ChapterOrder
  filter?: ChapterFilter
}

/**
 * Lignes de la liste des chapitres : regroupées par volume (croissant, « Sans volume » en
 * dernier), chaque volume par numéro de chapitre. Un intitulé de volume précède chaque groupe,
 * sauf si tous les chapitres sont sans volume. Sans recherche, chaque suite de chapitres
 * manquants forme une ligne `gap` avant le chapitre présent qui la suit.
 *
 * `view` inverse l'ordre (volumes et chapitres, du dernier au premier) ou ne garde qu'un état
 * de lecture ; filtrée, la liste ne montre pas les chapitres manquants.
 */
export function buildSeriesChapterRows(
  chapters: readonly Work[],
  query = '',
  view: ChapterListView = {},
): SeriesChapterRow[] {
  const filter = view.filter ?? 'all'
  const searching = query.trim() !== ''
  const narrowed = searching || filter !== 'all'
  const gaps = new Map(narrowed ? [] : chapterGaps(chapters).map((gap) => [gap.beforeId, gap]))
  const groups = new Map<string, { volume?: number; works: Work[] }>()
  for (const work of sortChapters(chapters)) {
    if (searching && !matchesChapterQuery(work, query)) continue
    if (filter !== 'all' && chapterState(work) !== filter) continue
    const key = work.volume === undefined ? NO_VOLUME : String(work.volume)
    const group = groups.get(key)
    if (group) group.works.push(work)
    else groups.set(key, { volume: work.volume, works: [work] })
  }
  const ordered = [...groups.entries()].sort(
    ([, a], [, b]) => (a.volume ?? Infinity) - (b.volume ?? Infinity),
  )
  const withHeadings = !(ordered.length === 1 && ordered[0]![0] === NO_VOLUME)
  const descending = view.order === 'desc'
  if (descending) ordered.reverse()

  const rows: SeriesChapterRow[] = []
  for (const [key, group] of ordered) {
    if (withHeadings) {
      rows.push({
        kind: 'group',
        key: `group-${key}`,
        volume: group.volume,
        count: group.works.length,
      })
    }
    // Dans l'ordre inverse, un trou suit le chapitre présent qui le borne par le haut.
    const body: SeriesChapterRow[] = []
    for (const work of group.works) {
      const gap = gaps.get(work.id)
      if (gap) {
        const count = gap.to - gap.from + 1
        body.push({ kind: 'gap', key: `gap-${gap.from}`, from: gap.from, to: gap.to, count })
      }
      body.push({
        kind: 'chapter',
        key: work.id,
        work,
        number: work.chapter!,
        title: work.chapterTitle,
        state: chapterState(work),
      })
    }
    rows.push(...(descending ? body.reverse() : body))
  }
  return rows
}
