import type { CoreBridge } from '~/services/core/bridge'
import { MemoryBridge } from '~/services/core/memory'

/**
 * Fournit le cœur à l'app. Phase 0 : `MemoryBridge` ; `WebBridge` (wasm + OPFS) et
 * `TauriBridge` (choisi via `window.__TAURI_INTERNALS__`) le remplaceront.
 */
export default defineNuxtPlugin({
  name: 'torgas-core',
  async setup() {
    const core: CoreBridge = new MemoryBridge()
    await core.init()
    return { provide: { core } }
  },
})
