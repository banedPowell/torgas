import { mockNuxtImport } from '@nuxt/test-utils/runtime'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CoreBridge } from '~/services/core/bridge'
import { MemoryBridge } from '~/services/core/memory'
import type { ImportResult } from '~/types/core'

const { bridge, toast } = vi.hoisted(() => ({
  bridge: { current: null as CoreBridge | null },
  toast: { add: vi.fn() },
}))

mockNuxtImport('useCore', () => () => bridge.current!)
mockNuxtImport('useToast', () => () => toast)

function file(name: string, content = name): File {
  return new File([new TextEncoder().encode(content)], name)
}

/** Promesse résolue à la main, pour figer le cœur au milieu d'un import. */
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => (resolve = r))
  return { promise, resolve }
}

describe('useImport', () => {
  beforeEach(() => {
    bridge.current = new MemoryBridge()
    toast.add.mockReset()
    clearNuxtState()
  })

  it('importe les fichiers et classe les résultats par statut', async () => {
    const importer = useImport()
    await importer.add([
      file('Le Horla.epub', 'horla'),
      file('copie.epub', 'horla'),
      file('notes.pdf'),
      file('Little Nemo 01.cbz', 'nemo'),
    ])
    expect(importer.items.value.map((i) => i.state)).toEqual([
      'imported',
      'duplicate',
      'unsupported',
      'imported',
    ])
    expect(importer.counts.value).toMatchObject({ imported: 2, duplicate: 1, unsupported: 1 })
    expect(importer.items.value[1]?.work?.title).toBe('Le Horla')
    expect(importer.running.value).toBe(false)
    expect(importer.progress.value).toBe(1)
    expect(importer.done.value).toBe(4)
    expect(importer.total.value).toBe(4)
    expect(toast.add).toHaveBeenCalledOnce()
    expect(toast.add.mock.calls[0]![0].title).toBe('2 œuvres importées')
    // La bibliothèque est rechargée après l'import.
    expect(useLibrary().works.value).toHaveLength(2)
  })

  it('traite un fichier à la fois, dans l’ordre', async () => {
    const core = bridge.current!
    const original = core.importFile.bind(core)
    const order: string[] = []
    let inFlight = 0
    core.importFile = async (name, bytes) => {
      inFlight++
      expect(inFlight).toBe(1)
      order.push(name)
      await new Promise((r) => setTimeout(r, 1))
      inFlight--
      return original(name, bytes)
    }
    const importer = useImport()
    await Promise.all([
      importer.add([file('a.epub'), file('b.epub')]),
      importer.add([file('c.epub')]),
    ])
    expect(order).toEqual(['a.epub', 'b.epub', 'c.epub'])
    expect(importer.counts.value.imported).toBe(3)
  })

  it('suit la progression globale et annule les fichiers restants', async () => {
    const gate = deferred<ImportResult>()
    const core = bridge.current!
    const original = core.importFile.bind(core)
    core.importFile = vi.fn(async (name: string, bytes: Uint8Array) => {
      await gate.promise
      return original(name, bytes)
    })
    const importer = useImport()
    const run = importer.add([file('a.epub'), file('b.epub'), file('c.epub')])
    await vi.waitFor(() => expect(importer.current.value?.state).toBe('importing'))
    expect(importer.current.value?.name).toBe('a.epub')
    expect(importer.running.value).toBe(true)
    expect(importer.progress.value).toBeGreaterThan(0)
    expect(importer.progress.value).toBeLessThan(1)

    importer.cancel()
    gate.resolve({ status: 'imported' })
    await run
    expect(importer.items.value.map((i) => i.state)).toEqual(['imported', 'cancelled', 'cancelled'])
    expect(core.importFile).toHaveBeenCalledOnce()
    expect(importer.total.value).toBe(1)
    expect(toast.add.mock.calls[0]![0].title).toBe('1 œuvre importée')

    importer.clear()
    expect(importer.items.value).toHaveLength(0)
  })

  it('signale une erreur du cœur sans arrêter la file', async () => {
    const core = bridge.current!
    const original = core.importFile.bind(core)
    core.importFile = (name, bytes) =>
      name === 'casse.epub' ? Promise.reject(new Error('disque plein')) : original(name, bytes)
    const importer = useImport()
    await importer.add([file('casse.epub'), file('ok.epub')])
    expect(importer.items.value[0]).toMatchObject({ state: 'error', message: 'disque plein' })
    expect(importer.items.value[1]?.state).toBe('imported')
  })

  it('n’affiche pas de toast si rien n’a été importé', async () => {
    const importer = useImport()
    await importer.add([file('notes.txt')])
    expect(importer.items.value[0]?.state).toBe('unsupported')
    expect(toast.add).not.toHaveBeenCalled()
  })

  it('repart d’un compteur neuf pour un nouvel import', async () => {
    const importer = useImport()
    await importer.add([file('a.epub'), file('b.epub')])
    await importer.add([file('c.epub')])
    expect(importer.items.value).toHaveLength(3)
    expect(importer.total.value).toBe(1)
    expect(importer.done.value).toBe(1)
  })
})
