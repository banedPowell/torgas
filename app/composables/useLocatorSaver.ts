import { getCurrentInstance } from 'vue'
import type { Locator } from '~/types/core'

/** Attente maximale de la dernière sauvegarde avant de quitter le lecteur (ms). */
export const LOCATOR_FLUSH_TIMEOUT = 3000

export interface LocatorSaverOptions {
  /** Intervalle minimal entre deux sauvegardes pendant la lecture (ms). */
  interval: number
}

interface Pending {
  workId: string
  locator: Locator
}

/**
 * Sauvegarde de la position de lecture, commune aux lecteurs EPUB et manga :
 * - chaque changement de page est copié tout de suite dans `localStorage` (synchrone), puis
 *   écrit dans le cœur au plus une fois par `interval` ;
 * - `flush()` écrit sans attendre la dernière position et se résout quand le cœur l'a
 *   enregistrée (y compris une écriture déjà en cours) ;
 * - quitter la route du lecteur attend `flush()` (au plus `LOCATOR_FLUSH_TIMEOUT`) : la page
 *   suivante lit donc une position et une progression à jour (#29) ;
 * - au chargement, `restore()` reprend la copie locale si le cœur ne l'a pas reçue (page
 *   déchargée pendant l'écriture, #30) et la lui pousse.
 */
export function useLocatorSaver(workId: MaybeRefOrGetter<string>, options: LocatorSaverOptions) {
  const core = useCore()

  let pending: Pending | null = null
  let lastSaved: Pending | null = null
  let running: Promise<void> | null = null

  async function write(): Promise<void> {
    const next = pending
    pending = null
    if (!next) return
    if (lastSaved?.workId === next.workId && samePlace(lastSaved.locator, next.locator)) {
      clearLocatorBackup(next.workId, next.locator)
      return
    }
    try {
      await core.saveLocator(next.workId, next.locator)
      lastSaved = next
      clearLocatorBackup(next.workId, next.locator)
    } catch {
      // Nouvel essai au prochain changement de page ou à la fermeture ; la copie locale reste.
      pending ??= next
    }
  }

  /** Écrit la position en attente, après l'écriture en cours s'il y en a une. */
  function persist(): Promise<void> {
    const current: Promise<void> = (running ? running.then(write) : write()).finally(() => {
      if (running === current) running = null
    })
    running = current
    return current
  }

  const persistThrottled = useThrottleFn(persist, options.interval, true, true)

  /** Nouvelle position : copie locale immédiate, écriture dans le cœur limitée. */
  function track(locator: Locator): void {
    const id = toValue(workId)
    pending = { workId: id, locator: { ...locator } }
    writeLocatorBackup(id, locator)
    void persistThrottled()
  }

  /** Écrit tout de suite la dernière position ; se résout une fois enregistrée. */
  function flush(): Promise<void> {
    return persist()
  }

  /**
   * Position à reprendre, d'après celle du cœur et la copie locale. Une copie plus récente
   * que la dernière lecture enregistrée (`lastReadAt`) l'emporte et est écrite dans le cœur.
   */
  async function restore(stored: Locator | null, lastReadAt?: string): Promise<Locator | null> {
    const id = toValue(workId)
    lastSaved = stored ? { workId: id, locator: stored } : null
    const { locator, push } = reconcileLocator(stored, readLocatorBackup(id), lastReadAt)
    if (!push || !locator) {
      clearLocatorBackup(id)
      return stored
    }
    pending = { workId: id, locator }
    await persist()
    return locator
  }

  if (import.meta.client) {
    useEventListener(document, 'visibilitychange', () => {
      if (document.visibilityState === 'hidden') void flush()
    })
    useEventListener(window, 'pagehide', () => void flush())
    useEventListener(window, 'beforeunload', () => void flush())
  }
  tryOnScopeDispose(() => void flush())

  // Quitter le lecteur (bouton, Échap, retour du navigateur, lien) attend la dernière écriture.
  if (getCurrentInstance()) {
    const beforeLeave = () => flushWithin(flush(), LOCATOR_FLUSH_TIMEOUT)
    onBeforeRouteLeave(beforeLeave)
    onBeforeRouteUpdate(beforeLeave)
  }

  return { track, flush, restore }
}

/**
 * Même endroit que la dernière sauvegarde : rien à réécrire. En EPUB, le CFI suffit (la
 * fraction d'un même CFI varie un peu avec la mise en page) ; en CBZ, la page et la
 * progression (la fin du volume garde la dernière page mais passe à 100 %).
 */
function samePlace(a: Locator, b: Locator): boolean {
  if (a.format === 'epub' && b.format === 'epub') return (a.cfi ?? null) === (b.cfi ?? null)
  return sameLocator(a, b)
}

/** Attend `task`, sans bloquer la navigation plus de `ms` si le cœur ne répond pas. */
function flushWithin(task: Promise<void>, ms: number): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<void>((resolve) => (timer = setTimeout(resolve, ms)))
  return Promise.race([task, timeout]).finally(() => clearTimeout(timer))
}
