import type { ImportStatus, Work } from '~/types/core'

export type ImportItemState = 'pending' | 'reading' | 'importing' | 'cancelled' | ImportStatus

export interface ImportEntry {
  id: number
  name: string
  sizeBytes: number
  state: ImportItemState
  /** Progression du fichier, de 0 à 1 (lecture puis analyse). */
  progress: number
  work?: Work
  message?: string
}

const ACTIVE: ImportItemState[] = ['pending', 'reading', 'importing']
/** Part de la lecture du fichier dans sa progression ; le reste revient au cœur. */
const READ_SHARE = 0.6

/** Lit un fichier en signalant la progression ; s'arrête si `cancelled()` devient vrai. */
async function readFile(
  file: File,
  onProgress: (fraction: number) => void,
  cancelled: () => boolean,
): Promise<Uint8Array | null> {
  if (typeof file.stream !== 'function' || file.size === 0) {
    return new Uint8Array(await file.arrayBuffer())
  }
  const bytes = new Uint8Array(file.size)
  const reader = file.stream().getReader()
  let offset = 0
  for (;;) {
    if (cancelled()) {
      await reader.cancel()
      return null
    }
    const { done, value } = await reader.read()
    if (done) break
    bytes.set(value.subarray(0, bytes.length - offset), offset)
    offset += value.length
    onProgress(Math.min(offset / file.size, 1))
  }
  return bytes
}

/**
 * File d'import : fichiers traités un par un, progression par fichier et globale, résultat par
 * statut (importé, doublon, DRM, non pris en charge, erreur), annulation des fichiers restants.
 * La bibliothèque est rechargée à la fin de la file ; le panneau d'import montre le résultat.
 */
export function useImport() {
  const core = useCore()
  const library = useLibrary()

  const items = useState('import:items', () => shallowRef<ImportEntry[]>([]))
  const running = useState('import:running', () => false)
  // Fichiers en attente (non sérialisables) et compteurs, hors réactivité profonde.
  const files = useState('import:files', () => markRaw(new Map<number, File>()))
  const control = useState('import:control', () => ({ nextId: 1, batchFrom: 1, cancelled: false }))

  const counts = computed(() => {
    const result = {} as Record<ImportItemState, number>
    for (const item of items.value) result[item.state] = (result[item.state] ?? 0) + 1
    return result
  })
  const active = computed(() => items.value.filter((i) => ACTIVE.includes(i.state)))
  const current = computed(() =>
    items.value.find((i) => i.state === 'reading' || i.state === 'importing'),
  )
  /** Fichiers de la série d'imports en cours (terminés compris) : base de la progression globale. */
  const batch = computed(() =>
    items.value.filter((i) => i.id >= control.value.batchFrom && i.state !== 'cancelled'),
  )
  const done = computed(() => batch.value.filter((i) => !ACTIVE.includes(i.state)).length)
  const progress = computed(() => {
    if (batch.value.length === 0) return 0
    const sum = batch.value.reduce((acc, i) => acc + (ACTIVE.includes(i.state) ? i.progress : 1), 0)
    return sum / batch.value.length
  })

  function update(id: number, patch: Partial<ImportEntry>) {
    items.value = items.value.map((item) => (item.id === id ? { ...item, ...patch } : item))
  }

  async function processOne(item: ImportEntry, file: File) {
    update(item.id, { state: 'reading', progress: 0 })
    try {
      const bytes = await readFile(
        file,
        (fraction) => update(item.id, { progress: fraction * READ_SHARE }),
        () => control.value.cancelled,
      )
      if (!bytes) return update(item.id, { state: 'cancelled', progress: 0 })
      update(item.id, { state: 'importing', progress: READ_SHARE })
      const result = await core.importFile(file.name, bytes)
      update(item.id, {
        state: result.status,
        progress: 1,
        work: result.work,
        message: result.message,
      })
    } catch (error) {
      update(item.id, {
        state: 'error',
        progress: 1,
        message: error instanceof Error ? error.message : String(error),
      })
    }
  }

  async function run() {
    if (running.value) return
    running.value = true
    let imported = 0
    try {
      for (;;) {
        const next = items.value.find((i) => i.state === 'pending')
        if (!next) break
        const file = files.value.get(next.id)
        files.value.delete(next.id)
        if (!file) continue
        await processOne(next, file)
        if (items.value.find((i) => i.id === next.id)?.state === 'imported') imported++
      }
    } finally {
      running.value = false
    }
    if (imported > 0) await library.load()
  }

  /** Ajoute des fichiers à la file et lance le traitement si besoin. */
  function add(list: Iterable<File>): Promise<void> {
    const added: ImportEntry[] = []
    if (!running.value) control.value.batchFrom = control.value.nextId
    control.value.cancelled = false
    for (const file of list) {
      const id = control.value.nextId++
      files.value.set(id, file)
      added.push({ id, name: file.name, sizeBytes: file.size, state: 'pending', progress: 0 })
    }
    if (added.length === 0) return Promise.resolve()
    items.value = [...items.value, ...added]
    return run()
  }

  /** Annule les fichiers restants ; celui en cours d'analyse se termine. */
  function cancel() {
    control.value.cancelled = true
    for (const item of items.value) if (item.state === 'pending') files.value.delete(item.id)
    items.value = items.value.map((item) =>
      item.state === 'pending' ? { ...item, state: 'cancelled' } : item,
    )
  }

  /** Retire de la liste les fichiers terminés. */
  function clear() {
    items.value = items.value.filter((item) => ACTIVE.includes(item.state))
  }

  return {
    items: computed(() => items.value),
    running: readonly(running),
    counts,
    active,
    current,
    total: computed(() => batch.value.length),
    done,
    progress,
    add,
    cancel,
    clear,
  }
}
