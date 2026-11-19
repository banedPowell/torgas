import type { DropdownMenuItem } from '@nuxt/ui'
import type { Work } from '~/types/core'

/**
 * Actions d'un volume ou d'un chapitre sur la fiche de sa série (menu « … » de la ligne et
 * menu contextuel) : le lire, le supprimer seul (confirmation affichée par la page).
 */
export function useWorkItemMenu() {
  const { t } = useNuxtApp().$i18n

  return (work: Work, onRemove: () => void): DropdownMenuItem[][] => {
    const kind = readAction(work).kind
    return [
      [
        {
          label: t(`work.action.${kind}`, { percent: formatPercent(work.progress) }),
          icon: kind === 'reread' ? 'i-lucide-rotate-ccw' : 'i-lucide-play',
          to: readPath(work),
        },
      ],
      // Un chapitre retrouvé dans un volume ne se supprime pas seul : c'est le volume.
      ...(isInnerChapter(work)
        ? []
        : [
            [
              {
                label: t(work.chapter !== undefined ? 'deletion.chapter' : 'deletion.volume'),
                icon: 'i-lucide-trash-2',
                color: 'primary' as const,
                onSelect: onRemove,
              },
            ],
          ]),
    ]
  }
}
