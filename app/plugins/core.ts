import type { CoreBridge } from '~/services/core/bridge'

/** Cœur indisponible (OPFS refusé, navigation privée…) : chaque appel rejette avec la cause. */
function unavailable(cause: unknown): CoreBridge {
  const error = cause instanceof Error ? cause : new Error(String(cause))
  return new Proxy({} as CoreBridge, { get: () => () => Promise.reject(error) })
}

/**
 * Fournit le cœur à l'app : `WebBridge` (wasm + OPFS + wa-sqlite) dans le navigateur ;
 * `TauriBridge` (invoke + torgas://) dans la coquille desktop ; `MemoryBridge` en test seulement.
 */
export default defineNuxtPlugin({
  name: 'torgas-core',
  async setup() {
    let core: CoreBridge
    if (import.meta.test) {
      const { MemoryBridge } = await import('~/services/core/memory')
      core = new MemoryBridge()
    } else {
      core =
        '__TAURI_INTERNALS__' in window
          ? new (await import('~/services/core/tauri')).TauriBridge()
          : new (await import('~/services/core/web')).WebBridge()
    }
    try {
      await core.init()
    } catch (error) {
      console.error('Torgas : cœur indisponible', error)
      core = unavailable(error)
    }
    return { provide: { core } }
  },
})
