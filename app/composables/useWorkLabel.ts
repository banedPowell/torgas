import type { Series, Work } from '~/types/core'

/**
 * Nom lisible d'une œuvre rangée dans une série : « One Piece · ch. 1201 » ou « One Piece ·
 * vol. 13 » plutôt que le titre brut du fichier. Hors série, le titre de l'œuvre.
 */
export function useWorkLabel() {
  const { t } = useNuxtApp().$i18n
  return (work: Work, series?: Pick<Series, 'title'> | null): string => {
    if (series && work.chapter !== undefined) {
      return t('reader.comic.chapterTitle', {
        series: series.title,
        chapter: formatIssueNumber(work.chapter),
      })
    }
    if (series && work.volume !== undefined) {
      return t('reader.comic.volumeTitle', { series: series.title, volume: work.volume })
    }
    return work.title
  }
}
