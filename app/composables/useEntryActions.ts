import type { ContextMenuItem } from '@nuxt/ui'
import type { ReadingStatus, Work } from '~/types/core'
import type { LibraryEntry } from '~/types/library'

const STATUSES: ReadingStatus[] = ['to_read', 'reading', 'paused', 'finished', 'abandoned']

/**
 * Actions d'une entrée de la bibliothèque, pour son menu contextuel (clic droit sur desktop,
 * appui long sur mobile) : ouvrir la fiche, lire, changer le statut, sélectionner, supprimer.
 * La suppression passe par une confirmation (`pending`, affichée par la page).
 */
export function useEntryActions() {
  const core = useCore()
  const library = useLibrary()
  const selection = useLibrarySelection()
  const deletion = useWorkDeletion()
  const toast = useToast()
  const { t } = useNuxtApp().$i18n

  /** Entrée dont la suppression attend confirmation. */
  const pending = shallowRef<LibraryEntry | null>(null)

  /** Œuvre à ouvrir dans le lecteur : l'œuvre, ou le prochain volume d'une série. */
  function readTarget(entry: LibraryEntry): Work | undefined {
    return entry.kind === 'work' ? entry.work : (nextVolume(entry.works) ?? entry.works[0])
  }

  async function setStatus(work: Work, status: ReadingStatus) {
    try {
      await core.setStatus(work.id, status)
      await library.load()
      toast.add({
        title: t('work.status.updated', { status: t(`status.${status}`) }),
        icon: 'i-lucide-circle-check',
      })
    } catch {
      toast.add({ title: t('work.status.error'), icon: 'i-lucide-circle-alert', color: 'error' })
    }
  }

  function menuFor(entry: LibraryEntry): ContextMenuItem[][] {
    const summary = summarizeEntry(entry)
    const target = readTarget(entry)
    const open: ContextMenuItem[] = [
      { label: t('actions.openWork'), icon: 'i-lucide-book-open', to: summary.href },
    ]
    if (target) {
      const kind = readAction(target).kind
      open.push({
        label:
          entry.kind === 'series'
            ? t('actions.readNext')
            : t(`work.action.${kind}`, { percent: formatPercent(target.progress) }),
        icon: kind === 'reread' ? 'i-lucide-rotate-ccw' : 'i-lucide-play',
        to: `/read/${target.id}`,
      })
    }
    const manage: ContextMenuItem[] = []
    if (entry.kind === 'work') {
      const work = entry.work
      manage.push({
        label: t('work.status.label'),
        icon: 'i-lucide-bookmark',
        children: STATUSES.map((status) => ({
          label: t(`status.${status}`),
          type: 'checkbox' as const,
          checked: work.status === status,
          onSelect: () => void setStatus(work, status),
        })),
      })
    }
    manage.push({
      label: t('library.selection.start'),
      icon: 'i-lucide-square-check-big',
      onSelect: () => {
        selection.start()
        selection.toggle(entry.id)
      },
    })
    return [
      open,
      manage,
      [
        {
          label: t('deletion.action'),
          icon: 'i-lucide-trash-2',
          color: 'primary',
          onSelect: () => {
            pending.value = entry
          },
        },
      ],
    ]
  }

  /** Œuvres concernées par la suppression en attente (tous les volumes d'une série). */
  const pendingWorks = computed<Work[]>(() => {
    const entry = pending.value
    if (!entry) return []
    return entry.kind === 'work' ? [entry.work] : entry.works
  })

  async function confirmDelete() {
    if (await deletion.deleteWorks(pendingWorks.value)) pending.value = null
  }

  return {
    menuFor,
    pending: computed(() => pending.value),
    pendingWorks,
    deleting: deletion.deleting,
    confirmDelete,
    cancelDelete: () => (pending.value = null),
  }
}
