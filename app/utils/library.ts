import type { FileFormat, ReadingStatus, Series, Work } from '~/types/core'
import type { LibraryEntry, LibraryFilters, LibrarySort } from '~/types/library'
import { compareRecentFirst, naturalCompare } from './sort'

/** Au-delà de ce nombre d'entrées, les listes de la bibliothèque sont virtualisées. */
export const VIRTUAL_LIST_THRESHOLD = 200

function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
}

/** Une œuvre passe-t-elle les filtres ? La recherche porte sur titre, auteurs et série. */
export function matchesFilters(work: Work, filters: LibraryFilters, seriesTitle?: string): boolean {
  if (filters.format !== 'all' && work.format !== filters.format) return false
  if (filters.status !== 'all' && work.status !== filters.status) return false
  const query = normalize(filters.query.trim())
  if (!query) return true
  return [work.title, ...work.authors, seriesTitle ?? ''].some((text) =>
    normalize(text).includes(query),
  )
}

function compareVolumes(a: Work, b: Work): number {
  const byVolume = (a.volume ?? Infinity) - (b.volume ?? Infinity)
  return Number.isNaN(byVolume) || byVolume === 0 ? naturalCompare(a.title, b.title) : byVolume
}

export function entryTitle(entry: LibraryEntry): string {
  return entry.kind === 'work' ? entry.work.title : entry.series.title
}

function entryWorks(entry: LibraryEntry): Work[] {
  return entry.kind === 'work' ? [entry.work] : entry.works
}

function latest(dates: (string | undefined)[]): string | undefined {
  return dates.reduce<string | undefined>((max, d) => (d && (!max || d > max) ? d : max), undefined)
}

/** Regroupe les volumes d'une même série ; les œuvres sans série restent seules. */
export function groupBySeries(works: readonly Work[], series: readonly Series[]): LibraryEntry[] {
  const seriesById = new Map(series.map((s) => [s.id, s]))
  const volumes = new Map<string, { series: Series; works: Work[] }>()
  const entries: LibraryEntry[] = []

  for (const work of works) {
    const s = work.seriesId ? seriesById.get(work.seriesId) : undefined
    if (!s) {
      entries.push({ kind: 'work', id: work.id, work })
      continue
    }
    const group = volumes.get(s.id)
    if (group) group.works.push(work)
    else volumes.set(s.id, { series: s, works: [work] })
  }

  for (const { series: s, works: list } of volumes.values()) {
    const sorted = [...list].sort(compareVolumes)
    entries.push({
      kind: 'series',
      id: s.id,
      series: s,
      works: sorted,
      progress: sorted.reduce((sum, w) => sum + w.progress, 0) / sorted.length,
      finishedCount: sorted.filter((w) => w.status === 'finished').length,
    })
  }
  return entries
}

/** Trie les entrées : titre (A→Z), ajout ou dernière lecture (le plus récent d'abord). */
export function sortEntries(entries: readonly LibraryEntry[], sort: LibrarySort): LibraryEntry[] {
  const byTitle = (a: LibraryEntry, b: LibraryEntry) => naturalCompare(entryTitle(a), entryTitle(b))
  const key = (entry: LibraryEntry) =>
    latest(entryWorks(entry).map((w) => (sort === 'added' ? w.addedAt : w.lastReadAt)))

  return [...entries].sort((a, b) => {
    if (sort === 'title') return byTitle(a, b)
    return compareRecentFirst(key(a), key(b)) || byTitle(a, b)
  })
}

/** Filtre, regroupe par série puis trie. */
export function buildLibrary(
  works: readonly Work[],
  series: readonly Series[],
  filters: LibraryFilters,
  sort: LibrarySort,
): LibraryEntry[] {
  const seriesTitle = new Map(series.map((s) => [s.id, s.title]))
  const visible = works.filter((w) =>
    matchesFilters(w, filters, w.seriesId ? seriesTitle.get(w.seriesId) : undefined),
  )
  return sortEntries(groupBySeries(visible, series), sort)
}

/** Ce qu'une carte ou une ligne de la bibliothèque affiche pour une entrée. */
export interface EntrySummary {
  id: string
  title: string
  href: string
  coverUrl?: string
  format: FileFormat
  isSeries: boolean
  authors: string[]
  progress: number
  volumesTotal: number
  volumesFinished: number
}

export function summarizeEntry(entry: LibraryEntry): EntrySummary {
  const works = entryWorks(entry)
  const first = works[0]!
  const authors = [...new Set(works.flatMap((w) => w.authors))]
  return {
    id: entry.id,
    title: entryTitle(entry),
    href: `/works/${first.id}`,
    coverUrl: works.find((w) => w.coverUrl)?.coverUrl,
    format: first.format,
    isSeries: entry.kind === 'series',
    authors,
    progress: entry.kind === 'series' ? entry.progress : entry.work.progress,
    volumesTotal: works.length,
    volumesFinished: entry.kind === 'series' ? entry.finishedCount : 0,
  }
}

/** Nombre d'œuvres par statut, plus le total (`all`). */
export function countByStatus(works: readonly Work[]): Record<ReadingStatus | 'all', number> {
  const counts = { all: works.length, to_read: 0, reading: 0, finished: 0, abandoned: 0, paused: 0 }
  for (const w of works) counts[w.status]++
  return counts
}

/** Œuvre à proposer dans la barre « Reprendre » : la dernière lue et pas terminée. */
export function pickResume(works: readonly Work[]): Work | undefined {
  return works
    .filter((w) => w.lastReadAt && w.status !== 'finished' && w.progress < 1)
    .sort((a, b) => compareRecentFirst(a.lastReadAt, b.lastReadAt))[0]
}

/** Œuvre dont la barre « Reprendre » a été fermée, avec sa date de dernière lecture à ce moment. */
export interface DismissedResume {
  id: string
  lastReadAt: string | null
}

/** Reprise à afficher : masquée tant que c'est la même œuvre, non relue depuis la fermeture. */
export function visibleResume(
  resume: Work | undefined,
  dismissed: DismissedResume | null,
): Work | undefined {
  if (!resume || !dismissed) return resume
  const same = resume.id === dismissed.id && (resume.lastReadAt ?? null) === dismissed.lastReadAt
  return same ? undefined : resume
}
