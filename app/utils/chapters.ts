import type { ReaderTocEntry } from '~/types/reader'
import { entryFraction } from './toc'

/** État de lecture d'un chapitre sur la fiche. */
export type ChapterState = 'read' | 'current' | 'unread'

/** Ligne de la liste des chapitres : un intitulé de partie, ou un chapitre numéroté. */
export type ChapterRow =
  | { kind: 'part'; label: string; href: string }
  | {
      kind: 'chapter'
      label: string
      href: string
      /** Numéro d'ordre (1, 2…) parmi les chapitres. */
      number: number
      state: ChapterState
      /** Avancement dans le chapitre courant, de 0 à 1. */
      progress: number
    }

/**
 * Début de chaque section dans le livre, de 0 à 1 (une valeur de plus que de sections), calculé
 * comme foliate (`SectionProgress`) : taille des sections linéaires, 0 pour les autres.
 */
export function sectionFractionsOf(
  sections: readonly { linear?: string; size?: number }[],
): number[] {
  const sizes = sections.map((s) => (s.linear !== 'no' && (s.size ?? 0) > 0 ? s.size! : 0))
  const total = sizes.reduce((a, b) => a + b, 0)
  if (total <= 0) return []
  const fractions = [0]
  let sum = 0
  for (const size of sizes) fractions.push((sum += size) / total)
  return fractions
}

/**
 * Lignes de la fiche à partir du sommaire normalisé et de la progression globale.
 * Une entrée suivie d'entrées plus profondes est un intitulé de partie ; les autres sont des
 * chapitres. Un chapitre est lu quand la lecture a atteint le début du suivant ; le chapitre
 * courant est celui qui contient la progression (aucun si la lecture n'a pas commencé).
 */
export function buildChapterRows(
  entries: readonly ReaderTocEntry[],
  sectionFractions: readonly number[],
  progress: number,
): ChapterRow[] {
  const isPart = (i: number) => (entries[i + 1]?.depth ?? -1) > entries[i]!.depth
  const chapters = entries
    .map((entry, i) => ({ entry, i, start: entryFraction(entry, sectionFractions) }))
    .filter(({ i }) => !isPart(i))
  const started = progress > 0

  const states = new Map<number, { state: ChapterState; progress: number }>()
  chapters.forEach(({ i, start }, k) => {
    const end = chapters.slice(k + 1).find((c) => c.start !== null)?.start ?? 1
    const from = start ?? 0
    let state: ChapterState = 'unread'
    let within = 0
    if (started && progress >= end - 1e-6 && end > from) state = 'read'
    else if (started && progress >= from - 1e-6) {
      state = 'current'
      within = end > from ? Math.min(1, (progress - from) / (end - from)) : 0
    }
    states.set(i, { state, progress: within })
  })

  let number = 0
  return entries.map((entry, i) => {
    if (isPart(i)) return { kind: 'part', label: entry.label, href: entry.href }
    const { state, progress: within } = states.get(i)!
    return {
      kind: 'chapter',
      label: entry.label,
      href: entry.href,
      number: ++number,
      state,
      progress: within,
    }
  })
}

/** Chapitre courant (pour « Reprendre au chapitre … »), s'il y en a un. */
export function currentChapter(rows: readonly ChapterRow[]) {
  return rows.find(
    (row): row is Extract<ChapterRow, { kind: 'chapter' }> =>
      row.kind === 'chapter' && row.state === 'current',
  )
}
