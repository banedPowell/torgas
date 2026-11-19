import type { Work } from '~/types/core'

/**
 * Contenu d'une série dit avec les bons mots : « les 3 volumes », « les 120 chapitres » ou
 * « les 2 volumes et 40 chapitres » (et leur forme courte « 3 vol. », « 120 ch. »).
 */
export function useSeriesItems() {
  const { t } = useNuxtApp().$i18n

  function counts(works: readonly Work[]) {
    const chapters = works.filter(isChapter).length
    return { volumes: works.length - chapters, chapters }
  }

  /** Forme longue, en tête de phrase : « Les 3 volumes », « Le chapitre »… */
  function describe(works: readonly Work[]): string {
    const { volumes, chapters } = counts(works)
    const parts = [
      volumes > 0 && t('deletion.items.volumes', { n: volumes }, volumes),
      chapters > 0 && t('deletion.items.chapters', { n: chapters }, chapters),
    ].filter((part): part is string => !!part)
    const text =
      parts.length === 2 ? t('deletion.items.both', { a: parts[0], b: parts[1] }) : (parts[0] ?? '')
    return text.charAt(0).toUpperCase() + text.slice(1)
  }

  /** Forme courte, entre parenthèses après le titre : « 3 vol. », « 2 vol., 40 ch. ». */
  function short(works: readonly Work[]): string {
    const { volumes, chapters } = counts(works)
    return [
      volumes > 0 && t('deletion.items.volumesShort', { n: volumes }),
      chapters > 0 && t('deletion.items.chaptersShort', { n: chapters }),
    ]
      .filter(Boolean)
      .join(', ')
  }

  /** Texte de confirmation de la suppression d'une série. */
  function deletionDescription(works: readonly Work[]): string {
    return t('deletion.seriesDescription', { items: describe(works) }, works.length)
  }

  return { describe, short, deletionDescription }
}
