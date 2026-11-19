import type { VolumeChapter, Work } from '~/types/core'

/** Séparateur de l'identifiant d'un chapitre contenu dans un volume : `<volume>@<page>`. */
const INNER = '@'

/** L'œuvre est un chapitre retrouvé dans un volume (pas un fichier à part). */
export function isInnerChapter(work: Pick<Work, 'id'>): boolean {
  return work.id.includes(INNER)
}

/** Chemin du lecteur : l'œuvre, ou le volume ouvert à la première page du chapitre. */
export function readPath(work: Pick<Work, 'id'>): string {
  const at = work.id.lastIndexOf(INNER)
  if (at < 0) return `/read/${work.id}`
  return `/read/${work.id.slice(0, at)}?page=${work.id.slice(at + 1)}`
}

/**
 * Chapitres d'un volume présentés comme des chapitres de la série : mêmes champs qu'une œuvre
 * (numéro, volume, format), identifiant `<volume>@<page>`. La progression de chacun se
 * déduit de celle du volume : les pages lues couvrent les premiers chapitres.
 */
export function innerChapterWorks(volume: Work, chapters: readonly VolumeChapter[]): Work[] {
  const pageCount = volume.pageCount ?? 0
  const done = volume.status === 'finished' || volume.progress >= 1
  const seen = done ? pageCount : Math.round(volume.progress * pageCount)
  return chapters.map((chapter, index) => {
    const end = chapters[index + 1]?.page ?? pageCount
    const length = Math.max(1, end - chapter.page)
    const progress = done ? 1 : Math.min(Math.max((seen - chapter.page) / length, 0), 1)
    return {
      ...volume,
      id: `${volume.id}${INNER}${chapter.page}`,
      chapter: chapter.number,
      chapterTitle: chapter.title,
      progress,
      status: progress >= 1 ? 'finished' : progress > 0 ? 'reading' : 'to_read',
      lastReadAt: progress > 0 ? volume.lastReadAt : undefined,
    }
  })
}

/**
 * Chapitres trouvés dans les volumes d'une série, sauf ceux qui existent déjà en fichier à
 * part (le fichier prime).
 */
export function seriesInnerChapters(
  volumes: readonly Work[],
  found: Readonly<Record<string, readonly VolumeChapter[]>>,
  fileChapters: readonly Work[],
): Work[] {
  const known = new Set(fileChapters.map((c) => c.chapter))
  return volumes.flatMap((volume) =>
    innerChapterWorks(volume, found[volume.id] ?? []).filter((c) => !known.has(c.chapter)),
  )
}
