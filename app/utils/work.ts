import type { ReadingStatus, Series, Work } from '~/types/core'
import type {
  ReadAction,
  SeriesSummary,
  SeriesView,
  VolumeRow,
  WorkMeta,
  WorkTarget,
} from '~/types/work'
import { clampProgress } from './format'
import { isChapter, sortChapters, splitSeriesWorks } from './seriesChapters'
import { compareRecentFirst, naturalCompare } from './sort'

/** Volumes triés par numéro, puis par titre (les volumes sans numéro à la fin). */
export function sortVolumes(works: readonly Work[]): Work[] {
  return [...works].sort((a, b) => {
    const byVolume = (a.volume ?? Infinity) - (b.volume ?? Infinity)
    return Number.isNaN(byVolume) || byVolume === 0 ? naturalCompare(a.title, b.title) : byVolume
  })
}

function seriesTarget(series: Series, works: readonly Work[]): WorkTarget | null {
  const { volumes, chapters } = splitSeriesWorks(works.filter((w) => w.seriesId === series.id))
  const sorted = [...sortVolumes(volumes), ...sortChapters(chapters)]
  return sorted.length > 0 ? { kind: 'series', series, works: sorted } : null
}

/**
 * Détermine ce que montre la fiche pour un identifiant de la route : un identifiant de série,
 * ou celui d'une œuvre (la bibliothèque lie une série à son premier volume). Une œuvre qui
 * appartient à une série ouvre la fiche de la série ; une œuvre orpheline reste une œuvre seule.
 */
export function resolveTarget(
  id: string,
  works: readonly Work[],
  series: readonly Series[],
): WorkTarget | null {
  const work = works.find((w) => w.id === id)
  if (work) {
    const parent = work.seriesId ? series.find((s) => s.id === work.seriesId) : undefined
    return (parent && seriesTarget(parent, works)) || { kind: 'work', work }
  }
  const asSeries = series.find((s) => s.id === id)
  return asSeries ? seriesTarget(asSeries, works) : null
}

/** Numéros de volumes absents entre le volume 1 et le plus grand numéro présent. */
export function missingVolumes(volumes: readonly Work[]): number[] {
  const present = new Set<number>()
  for (const v of volumes) if (v.volume !== undefined && v.volume >= 1) present.add(v.volume)
  const last = Math.max(0, ...present)
  const missing: number[] = []
  for (let n = 1; n <= last; n++) if (!present.has(n)) missing.push(n)
  return missing
}

/** Premier volume (dans l'ordre de la série) qui n'est pas terminé. */
export function nextVolume(volumes: readonly Work[]): Work | undefined {
  return sortVolumes(volumes).find((v) => v.status !== 'finished')
}

export function summarizeSeries(
  volumes: readonly Work[],
  unit: SeriesView = 'volumes',
): SeriesSummary {
  const total = volumes.length
  const sum = volumes.reduce((acc, v) => acc + clampProgress(v.progress), 0)
  return {
    unit,
    total,
    finished: volumes.filter((v) => v.status === 'finished').length,
    progress: total === 0 ? 0 : sum / total,
  }
}

/**
 * Vue ouverte par défaut sur la fiche d'une série : les chapitres si elle n'a qu'eux ou si tous
 * ses volumes sont lus (on suit alors la parution en chapitres) ; sinon la vue de la dernière
 * œuvre lue, et les volumes si rien n'a encore été lu.
 */
export function defaultSeriesView(volumes: readonly Work[], chapters: readonly Work[]): SeriesView {
  if (chapters.length === 0) return 'volumes'
  if (volumes.every((v) => v.status === 'finished')) return 'chapters'
  const lastRead = [...volumes, ...chapters]
    .filter((w) => w.lastReadAt)
    .sort((a, b) => compareRecentFirst(a.lastReadAt, b.lastReadAt))[0]
  return lastRead && isChapter(lastRead) ? 'chapters' : 'volumes'
}

/** Statut d'une série, déduit de ses volumes (le cœur ne stocke un statut que par œuvre). */
export function deriveSeriesStatus(volumes: readonly Work[]): ReadingStatus {
  const first = volumes[0]
  if (!first) return 'to_read'
  if (volumes.every((v) => v.status === first.status)) return first.status
  const started = volumes.some(
    (v) => v.status === 'finished' || v.status === 'reading' || v.progress > 0,
  )
  return started ? 'reading' : 'to_read'
}

/**
 * Manga ou BD au format EPUB (reconnu par le cœur à l'import) : lisible avec le lecteur EPUB,
 * mais le CBZ est mieux géré (double page, sens de lecture, volume suivant).
 */
export function isEpubComic(work: Pick<Work, 'format' | 'kind'>): boolean {
  return work.format === 'epub' && work.kind === 'comic'
}

/** Bouton principal : lire, reprendre à N % ou relire. */
export function readAction(work: Pick<Work, 'status' | 'progress'>): ReadAction {
  const progress = clampProgress(work.progress)
  if (work.status === 'finished' || progress >= 1) return { kind: 'reread', percent: 100 }
  if (progress > 0) return { kind: 'resume', percent: Math.round(progress * 100) }
  return { kind: 'read', percent: 0 }
}

/** Trous de numérotation, regroupés par suites de volumes consécutifs manquants. */
function gapRuns(volumes: readonly Work[]): number[][] {
  const runs: number[][] = []
  let previous = 0
  for (const n of missingVolumes(volumes)) {
    if (n === previous + 1 && runs.length > 0) runs[runs.length - 1]!.push(n)
    else runs.push([n])
    previous = n
  }
  return runs
}

/**
 * Lignes de la liste des volumes. Une suite de volumes manquants forme une seule ligne `gap`,
 * insérée avant le premier volume présent qui la suit.
 */
export function buildVolumeRows(volumes: readonly Work[]): VolumeRow[] {
  const pending = gapRuns(volumes)
  const rows: VolumeRow[] = []
  for (const work of sortVolumes(volumes)) {
    while (work.volume !== undefined && pending[0] && pending[0][0]! < work.volume) {
      rows.push({ kind: 'gap', numbers: pending.shift()! })
    }
    rows.push({ kind: 'volume', work, number: work.volume })
  }
  return rows
}

const listFormat = new Intl.ListFormat('fr', { style: 'long', type: 'conjunction' })

/** « 4 et 7 », « 1, 3 à 5 et 8 » : les suites de trois numéros ou plus sont abrégées. */
export function formatVolumeNumbers(numbers: readonly number[]): string {
  const sorted = [...new Set(numbers)].sort((a, b) => a - b)
  const parts: string[] = []
  for (let i = 0; i < sorted.length;) {
    let j = i
    while (j + 1 < sorted.length && sorted[j + 1] === sorted[j]! + 1) j++
    if (j - i >= 2) parts.push(`${sorted[i]} à ${sorted[j]}`)
    else for (let k = i; k <= j; k++) parts.push(String(sorted[k]))
    i = j + 1
  }
  return listFormat.format(parts)
}

/** Métadonnées d'en-tête pour une œuvre seule ou, agrégées, pour une série. */
export function describeTarget(target: WorkTarget): WorkMeta {
  if (target.kind === 'work') {
    const w = target.work
    return {
      title: w.title,
      authors: w.authors,
      coverUrl: w.coverUrl,
      format: w.format,
      kind: w.kind,
      language: w.language,
      sizeBytes: w.sizeBytes,
      addedAt: w.addedAt,
      isSeries: false,
      volumeCount: 1,
      chapterCount: 0,
    }
  }
  const { series, works } = target
  const first = works[0]!
  const chapterCount = works.filter(isChapter).length
  return {
    title: series.title,
    authors: [...new Set(works.flatMap((v) => v.authors))],
    coverUrl: works.find((v) => v.coverUrl)?.coverUrl,
    format: first.format,
    kind: first.kind,
    language: works.find((v) => v.language)?.language,
    sizeBytes: works.reduce((sum, v) => sum + v.sizeBytes, 0),
    addedAt: works.map((v) => v.addedAt).reduce((min, d) => (d < min ? d : min)),
    isSeries: true,
    volumeCount: works.length - chapterCount,
    chapterCount,
  }
}
