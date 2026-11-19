import type { CoreBridge } from '~/services/core/bridge'

/** Cœur indisponible (OPFS refusé, navigation privée…) : chaque appel rejette avec la cause. */
function unavailable(cause: unknown): CoreBridge {
  const error = cause instanceof Error ? cause : new Error(String(cause))
  return new Proxy({} as CoreBridge, { get: () => () => Promise.reject(error) })
}

/**
 * Fournit le cœur à l'app : `WebBridge` (wasm + OPFS + wa-sqlite) dans le navigateur ;
 * `MemoryBridge` en test seulement.
 */
export default defineNuxtPlugin({
  name: 'torgas-core',
  async setup() {
    let core: CoreBridge
    if (import.meta.test) {
      const { MemoryBridge } = await import('~/services/core/memory')
      core = new MemoryBridge()
    } else {
      if ('__TAURI_INTERNALS__' in window) {
        // TODO(#10) : `TauriBridge` (invoke + protocole torgas://) ; d'ici là, le web sert aussi.
      }
      const { WebBridge } = await import('~/services/core/web')
      core = new WebBridge()
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
