import type * as TorgasWasm from 'torgas-wasm'

export type CoreWasm = typeof TorgasWasm

let loading: Promise<CoreWasm> | null = null

/**
 * Charge `torgas-wasm` une seule fois (import dynamique, promesse mémorisée) : le module
 * (~870 ko) n'est téléchargé qu'au démarrage du `WebBridge`, pas avec le reste de l'app.
 */
export function loadWasm(): Promise<CoreWasm> {
  loading ??= (async () => {
    const [mod, { default: wasmUrl }] = await Promise.all([
      import('torgas-wasm'),
      import('torgas-wasm/torgas_wasm_bg.wasm?url'),
    ])
    await mod.default({ module_or_path: wasmUrl })
    return mod
  })().catch((error: unknown) => {
    loading = null
    throw error
  })
  return loading
}

/**
 * Un import refusé par le cœur : format non pris en charge (archive illisible, ZIP sans EPUB
 * ni images) ou autre erreur (EPUB mal formé…). Les messages viennent de `CoreError`.
 */
export function importErrorStatus(message: string): 'unsupported' | 'error' {
  return /^(format non pris en charge|archive ZIP illisible)/i.test(message)
    ? 'unsupported'
    : 'error'
}
