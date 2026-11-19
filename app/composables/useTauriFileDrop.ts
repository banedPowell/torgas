import type { UnlistenFn } from '@tauri-apps/api/event'

/** Vrai dans la coquille desktop Tauri. */
export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

/**
 * Desktop : fichiers déposés sur la fenêtre (glisser-déposer natif de Tauri) ou ouverts par
 * association `.epub`/`.cbz`. Rust les met en attente et prévient l'app ; ils sont lus puis
 * confiés à `onFiles` (en pratique `useImport().add`), comme un dépôt sur le web.
 * Hors Tauri, ne fait rien : le dépôt HTML5 de `ImportDropzone` s'en charge.
 */
export function useTauriFileDrop(onFiles: (files: File[]) => unknown) {
  /** Fichiers survolant la fenêtre (le dépôt natif masque les événements HTML5). */
  const hovering = ref(false)
  if (!isTauri()) return { hovering: readonly(hovering) }

  const unlisteners: UnlistenFn[] = []
  let disposed = false
  let draining: Promise<void> = Promise.resolve()

  async function drain() {
    const { readOpenedFile, takeOpenedFiles } = await import('~/services/core/tauri')
    for (const opened of await takeOpenedFiles()) {
      try {
        onFiles([await readOpenedFile(opened)])
      } catch (error) {
        console.error('Torgas : lecture du fichier déposé impossible', opened.name, error)
      }
    }
  }

  function queueDrain() {
    draining = draining.then(drain).catch((error) => console.error('Torgas :', error))
  }

  onMounted(async () => {
    const [{ listen }, { getCurrentWebview }, { OPENED_FILES_EVENT }] = await Promise.all([
      import('@tauri-apps/api/event'),
      import('@tauri-apps/api/webview'),
      import('~/services/core/tauri'),
    ])
    const subscriptions = await Promise.all([
      listen(OPENED_FILES_EVENT, queueDrain),
      getCurrentWebview().onDragDropEvent(({ payload }) => {
        hovering.value = payload.type === 'enter' || payload.type === 'over'
      }),
    ])
    if (disposed) return subscriptions.forEach((unlisten) => unlisten())
    unlisteners.push(...subscriptions)
    // Fichiers ouverts avant que l'app n'écoute (lancement par association).
    queueDrain()
  })

  onBeforeUnmount(() => {
    disposed = true
    unlisteners.splice(0).forEach((unlisten) => unlisten())
  })

  return { hovering: readonly(hovering) }
}
