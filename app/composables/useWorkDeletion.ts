import type { Work } from '~/types/core'
import { clearLocatorBackup } from '~/utils/locatorBackup'

/** Œuvre à supprimer : son identifiant, et son titre pour le message de confirmation. */
export type DeletableWork = Pick<Work, 'id' | 'title'>

/**
 * Suppression d'œuvres de la bibliothèque (une depuis la fiche, plusieurs depuis le mode
 * sélection) : un seul appel au cœur pour tout le lot, puis mise à jour de la bibliothèque
 * (la barre « Reprendre » suit) et copies locales de position effacées. Pas de toast de
 * confirmation : l'œuvre disparaît de l'écran ; seule une erreur est signalée.
 */
export function useWorkDeletion() {
  const core = useCore()
  const library = useLibrary()
  const toast = useToast()
  const { t } = useNuxtApp().$i18n

  const deleting = useState('library:deleting', () => false)

  /** Supprime les œuvres ; renvoie `true` si c'est fait (une erreur est signalée par un toast). */
  async function deleteWorks(works: readonly DeletableWork[]): Promise<boolean> {
    if (works.length === 0 || deleting.value) return false
    deleting.value = true
    const ids = works.map((w) => w.id)
    try {
      await core.deleteWorks(ids)
      for (const id of ids) clearLocatorBackup(id)
      forgetVolumeChapters(ids)
      library.forget(ids)
      return true
    } catch (e) {
      toast.add({
        title: t('deletion.error'),
        description: e instanceof Error ? e.message : String(e),
        icon: 'i-lucide-circle-alert',
        color: 'error',
      })
      return false
    } finally {
      deleting.value = false
    }
  }

  return { deleting: readonly(deleting), deleteWorks }
}
