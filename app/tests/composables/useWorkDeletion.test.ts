import { flushPromises } from '@vue/test-utils'
import { mockNuxtImport } from '@nuxt/test-utils/runtime'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryBridge } from '~/services/core/memory'
import { readLocatorBackup, writeLocatorBackup } from '~/utils/locatorBackup'
import { nemo, sampleSeries, sampleWorks } from '../fixtures'

const { bridge, toasts } = vi.hoisted(() => ({
  bridge: { current: null as MemoryBridge | null },
  toasts: [] as { title?: string; description?: string; color?: string }[],
}))

mockNuxtImport('useCore', () => () => bridge.current!)
mockNuxtImport('useToast', () => () => ({ add: (toast: { title?: string }) => toasts.push(toast) }))

const bovary = sampleWorks.find((w) => w.id === 'bovary')!

describe('useWorkDeletion', () => {
  beforeEach(() => {
    bridge.current = new MemoryBridge({ works: sampleWorks, series: sampleSeries })
    toasts.length = 0
    localStorage.clear()
    clearNuxtState()
  })

  it('supprime une œuvre, met la bibliothèque à jour et retire la reprise', async () => {
    const library = useLibrary()
    await library.load()
    expect(library.resume.value?.id).toBe('bovary')
    const session = await bridge.current!.startSession('bovary')
    await bridge.current!.endSession(session, 12, 0.09)
    await bridge.current!.addBookmark('bovary', { format: 'epub', progress: 0.05 }, '')
    writeLocatorBackup('bovary', { format: 'epub', progress: 0.1 })

    const { deleteWorks, deleting } = useWorkDeletion()
    const pending = deleteWorks([bovary])
    expect(deleting.value).toBe(true)
    expect(await pending).toBe(true)
    expect(deleting.value).toBe(false)

    expect(await bridge.current!.getWork('bovary')).toBeNull()
    expect(await bridge.current!.listBookmarks('bovary')).toEqual([])
    expect(library.works.value.map((w) => w.id)).not.toContain('bovary')
    expect(library.resume.value?.id).not.toBe('bovary')
    expect(readLocatorBackup('bovary')).toBeNull()
    expect(toasts).toEqual([expect.objectContaining({ color: 'success' })])
    expect(toasts[0]!.title).toContain('Madame Bovary')

    // Le temps de lecture reste acquis : la session est gardée, détachée de l'œuvre.
    expect(bridge.current!.sessionsOf(null)).toEqual([
      expect.objectContaining({ id: session, minutes: 12 }),
    ])
  })

  it('supprime un lot en un appel et retire les séries vidées', async () => {
    const library = useLibrary()
    await library.load()
    const spy = vi.spyOn(bridge.current!, 'deleteWorks')
    const volumes = sampleWorks.filter((w) => w.seriesId === nemo.id)

    expect(await useWorkDeletion().deleteWorks(volumes)).toBe(true)
    expect(spy).toHaveBeenCalledOnce()
    expect(spy).toHaveBeenCalledWith(['nemo-10', 'nemo-2'])
    expect(library.series.value).toEqual([])
    expect(await bridge.current!.listSeries()).toEqual([])
    expect(library.works.value).toHaveLength(3)
    expect(toasts[0]!.title).toContain('2')
  })

  it('signale une erreur sans toucher à la bibliothèque', async () => {
    const library = useLibrary()
    await library.load()
    vi.spyOn(bridge.current!, 'deleteWorks').mockRejectedValue(new Error('disque plein'))

    expect(await useWorkDeletion().deleteWorks([bovary])).toBe(false)
    expect(library.works.value).toHaveLength(5)
    expect(toasts).toEqual([
      expect.objectContaining({ color: 'error', description: 'disque plein' }),
    ])
  })

  it('ne fait rien sans œuvre', async () => {
    const spy = vi.spyOn(bridge.current!, 'deleteWorks')
    expect(await useWorkDeletion().deleteWorks([])).toBe(false)
    expect(spy).not.toHaveBeenCalled()
  })

  it('réimporte une œuvre supprimée sans doublon', async () => {
    const bytes = new TextEncoder().encode('epub')
    const first = await bridge.current!.importFile('livre.epub', bytes)
    expect(await useWorkDeletion().deleteWorks([first.work!])).toBe(true)
    const again = await bridge.current!.importFile('livre.epub', bytes)
    expect(again.status).toBe('imported')
  })
})

describe('useLibrarySelection', () => {
  beforeEach(() => {
    bridge.current = new MemoryBridge({ works: sampleWorks, series: sampleSeries })
    toasts.length = 0
    clearNuxtState()
  })

  it('coche des œuvres et des séries puis supprime le lot', async () => {
    await useLibrary().load()
    const selection = useLibrarySelection()
    selection.start()
    expect(selection.active.value).toBe(true)

    selection.toggle('horla')
    selection.toggle(nemo.id)
    selection.toggle('eleves')
    selection.toggle('eleves')
    expect([...selection.selected.value]).toEqual(['horla', nemo.id])
    expect(selection.entries.value.map((e) => e.id)).toEqual(['horla', nemo.id])
    // Une série compte pour tous ses volumes.
    expect(selection.works.value.map((w) => w.id)).toEqual(['horla', 'nemo-2', 'nemo-10'])

    expect(await selection.deleteSelected()).toBe(true)
    await flushPromises()
    expect(selection.active.value).toBe(false)
    expect(selection.selected.value.size).toBe(0)
    expect(
      useLibrary()
        .works.value.map((w) => w.id)
        .sort(),
    ).toEqual(['bovary', 'eleves'])
  })

  it('reste en mode sélection si la suppression échoue', async () => {
    await useLibrary().load()
    vi.spyOn(bridge.current!, 'deleteWorks').mockRejectedValue(new Error('verrou'))
    const selection = useLibrarySelection()
    selection.start()
    selection.toggle('horla')
    expect(await selection.deleteSelected()).toBe(false)
    expect(selection.active.value).toBe(true)
    expect([...selection.selected.value]).toEqual(['horla'])
    selection.stop()
    expect(selection.active.value).toBe(false)
  })
})
