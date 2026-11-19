import type { Work } from '~/types/core'

/** État du chargement de l'œuvre du lecteur. */
export type ReaderWorkState = 'loading' | 'ready' | 'not-found' | 'error'

/**
 * Œuvre exacte ouverte dans le lecteur. Contrairement à `useWork`, l'identifiant n'est jamais
 * résolu vers une série : `/read/<id>` lit toujours l'œuvre (le volume) désignée. Se recharge
 * quand l'identifiant change (volume suivant : la page de la route est réutilisée).
 */
export function useReaderWork(id: MaybeRefOrGetter<string>) {
  const core = useCore()

  const work = shallowRef<Work | null>(null)
  const state = ref<ReaderWorkState>('loading')
  const error = ref<string | null>(null)
  let request = 0

  async function load(): Promise<void> {
    const requested = toValue(id)
    const current = ++request
    state.value = 'loading'
    error.value = null
    work.value = null
    try {
      const found = await core.getWork(requested)
      if (current !== request) return
      work.value = found
      state.value = found ? 'ready' : 'not-found'
    } catch (e) {
      if (current !== request) return
      error.value = e instanceof Error ? e.message : String(e)
      state.value = 'error'
    }
  }

  watch(() => toValue(id), load, { immediate: true })

  return { work: computed(() => work.value), state: readonly(state), error: readonly(error), load }
}
