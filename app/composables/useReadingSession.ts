import type { WatchSource } from 'vue'
import { createSessionTimer, type SessionTimer } from '~/utils/session'

export interface ReadingSessionOptions {
  /** Vrai quand le lecteur affiche l'œuvre : la session s'ouvre, et se clôt au retour à faux. */
  ready: MaybeRefOrGetter<boolean>
  /** Progression globale courante (0 à 1), relevée à la clôture. */
  progress: () => number
  /** Changements de page ou de position : chacun compte comme une activité. */
  activity?: WatchSource | WatchSource[]
}

const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'wheel', 'touchstart', 'scroll'] as const

/**
 * Session de lecture : démarre quand le lecteur est prêt, compte le temps actif seulement
 * (pause après 2 min sans interaction ou onglet caché), puis la clôt avec les minutes lues et
 * la progression. La clôture a lieu quand le lecteur n'est plus prêt, à son démontage et à
 * `pagehide`/`beforeunload`. Les erreurs du cœur sont silencieuses : lire ne doit jamais échouer
 * à cause du suivi. Le statut « en cours » / « terminé » est géré par le cœur (`saveLocator`).
 */
export function useReadingSession(
  workId: MaybeRefOrGetter<string>,
  options: ReadingSessionOptions,
) {
  const core = useCore()
  const library = useLibrary()
  const visibility = useDocumentVisibility()

  let timer: SessionTimer | null = null
  let opening: Promise<string | null> | null = null

  function start(): void {
    if (timer) return
    const t = createSessionTimer(Date.now())
    if (visibility.value === 'hidden') t.pause(Date.now())
    timer = t
    opening = core.startSession(toValue(workId)).catch(() => null)
  }

  /** Clôt la session (sans effet si aucune n'est ouverte : les déclencheurs se cumulent). */
  async function end(): Promise<void> {
    const current = timer
    const pending = opening
    if (!current || !pending) return
    timer = null
    opening = null
    // Mesures prises tout de suite : la clôture asynchrone ne doit pas compter de temps en plus.
    const minutes = current.minutes(Date.now())
    const raw = options.progress()
    const progress = Number.isFinite(raw) ? Math.min(1, Math.max(0, raw)) : 0
    const id = await pending
    if (!id) return
    try {
      await core.endSession(id, minutes, progress)
    } catch {
      return
    }
    // Le statut a pu changer : on recharge la bibliothèque si elle est déjà chargée.
    if (library.state.value !== 'idle') void library.load()
  }

  function touch(): void {
    timer?.touch(Date.now())
  }

  /** Relaie les interactions d'un document étranger (l'iframe d'un livre EPUB). */
  function listen(doc: Document): void {
    for (const type of ACTIVITY_EVENTS) {
      doc.addEventListener(type, touch, { capture: true, passive: true })
    }
  }

  watch(
    () => toValue(options.ready),
    (ready) => (ready ? start() : void end()),
    { immediate: true },
  )
  if (options.activity) watch(options.activity, touch)
  watch(visibility, (state) => {
    if (state === 'hidden') timer?.pause(Date.now())
    else timer?.resume(Date.now())
  })

  if (import.meta.client) {
    useEventListener(document, [...ACTIVITY_EVENTS], touch, { capture: true, passive: true })
    useEventListener(window, 'pagehide', () => void end())
    useEventListener(window, 'beforeunload', () => void end())
    // Retour depuis le cache de navigation (bouton « précédent ») : nouvelle session.
    useEventListener(window, 'pageshow', (e: PageTransitionEvent) => {
      if (e.persisted && toValue(options.ready)) start()
    })
  }
  tryOnScopeDispose(() => void end())

  return { touch, listen, end }
}
