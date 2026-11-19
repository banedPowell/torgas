import type { Series, Work } from '~/types/core'
import type { LibraryEntry } from '~/types/library'
import { groupBySeries } from '~/utils/library'

/**
 * Mode sélection de la bibliothèque (artboard `BibliothequeSuppression`) : on coche des cartes
 * (une œuvre, ou une série avec tous ses volumes), puis on supprime le lot après confirmation.
 * État partagé entre la page (cartes) et la mise en page (barre d'actions en bas).
 */
export function useLibrarySelection() {
  const library = useLibrary()
  const { deleting, deleteWorks } = useWorkDeletion()

  const active = useState('library:selection:active', () => false)
  /** Identifiants des entrées cochées (œuvre ou série), dans l'ordre où elles l'ont été. */
  const ids = useState<string[]>('library:selection:ids', () => [])

  const selected = computed(() => new Set(ids.value))
  /** Entrées cochées encore présentes, toutes séries comprises (sans les filtres affichés). */
  const entries = computed<LibraryEntry[]>(() => {
    // `readonly()` type les listes en lecture seule profonde ; elles ne sont pas modifiées ici.
    const works = library.works.value as readonly Work[]
    const series = library.series.value as readonly Series[]
    const byId = new Map(groupBySeries(works, series).map((e) => [e.id, e]))
    return ids.value.flatMap((id) => byId.get(id) ?? [])
  })
  /** Œuvres à supprimer : une série sélectionnée compte pour tous ses volumes. */
  const works = computed<Work[]>(() =>
    entries.value.flatMap((e) => (e.kind === 'work' ? [e.work] : e.works)),
  )

  function start() {
    ids.value = []
    active.value = true
  }

  function stop() {
    active.value = false
    ids.value = []
  }

  function toggle(id: string) {
    ids.value = selected.value.has(id) ? ids.value.filter((i) => i !== id) : [...ids.value, id]
  }

  /** Supprime les œuvres sélectionnées ; quitte le mode sélection si c'est fait. */
  async function deleteSelected(): Promise<boolean> {
    const done = await deleteWorks(works.value)
    if (done) stop()
    return done
  }

  return {
    active: readonly(active),
    selected,
    entries,
    works,
    deleting,
    start,
    stop,
    toggle,
    deleteSelected,
  }
}
