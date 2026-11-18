import type { Work } from '~/types/core'
import type { LoadState } from './useLibrary'

/** Une œuvre par son identifiant (la série et les volumes viendront avec la fiche). */
export function useWork(id: MaybeRefOrGetter<string>) {
  const core = useCore()
  const work = shallowRef<Work | null>(null)
  const state = ref<LoadState>('idle')
  const error = ref<string | null>(null)

  async function load(): Promise<void> {
    state.value = 'loading'
    error.value = null
    try {
      work.value = await core.getWork(toValue(id))
      state.value = 'ready'
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
      state.value = 'error'
    }
  }

  watch(() => toValue(id), load, { immediate: true })

  return { work: readonly(work), state: readonly(state), error: readonly(error), load }
}
