import { mockNuxtImport } from '@nuxt/test-utils/runtime'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope } from 'vue'
import { MemoryBridge } from '~/services/core/memory'
import type { ReaderPosition } from '~/types/reader'
import { readLocatorBackup, writeLocatorBackup } from '~/utils/locatorBackup'

const { bridge } = vi.hoisted(() => ({ bridge: { current: null as MemoryBridge | null } }))

mockNuxtImport('useCore', () => () => bridge.current!)

const pos = (n: number): ReaderPosition => ({
  cfi: `epubcfi(/6/${n})`,
  progress: n / 100,
  chapter: `Chapitre ${n}`,
})

async function importBook(core: MemoryBridge): Promise<string> {
  const result = await core.importFile('Le Horla.epub', new TextEncoder().encode('epub'))
  return result.work!.id
}

/** Monte le composable dans une portée qu'on peut arrêter (comme un démontage). */
function mount(id: string) {
  const scope = effectScope()
  const reader = scope.run(() => useReader(id))!
  return { reader, stop: () => scope.stop() }
}

describe('useReader', () => {
  let core: MemoryBridge
  let id: string

  beforeEach(async () => {
    core = new MemoryBridge()
    bridge.current = core
    id = await importBook(core)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('charge l’œuvre, le fichier et la dernière position', async () => {
    await core.saveLocator(id, { format: 'epub', cfi: 'epubcfi(/6/8)', progress: 0.4 })
    await core.addBookmark(id, { format: 'epub', cfi: 'epubcfi(/6/2)', progress: 0.1 }, 'I')
    const { reader, stop } = mount(id)
    await reader.load()
    expect(reader.state.value).toBe('ready')
    expect(reader.work.value?.title).toBe('Le Horla')
    expect(reader.file.value).toBeInstanceOf(File)
    expect(reader.file.value?.type).toBe('application/epub+zip')
    expect(reader.initialCfi.value).toBe('epubcfi(/6/8)')
    expect(reader.bookmarks.value).toHaveLength(1)
    stop()
  })

  it('signale une œuvre introuvable ou un fichier illisible', async () => {
    const missing = mount('inconnue')
    await missing.reader.load()
    expect(missing.reader.state.value).toBe('not-found')
    missing.stop()

    vi.spyOn(core, 'getBookBytes').mockRejectedValue(new Error('fichier absent'))
    const broken = mount(id)
    await broken.reader.load()
    expect(broken.reader.state.value).toBe('error')
    expect(broken.reader.error.value).toBe('fichier absent')
    broken.stop()
  })

  it('limite les sauvegardes à une toutes les 5 s, en gardant la dernière position', async () => {
    vi.useFakeTimers()
    const save = vi.spyOn(core, 'saveLocator')
    const { reader, stop } = mount(id)
    await reader.load()

    reader.relocate(pos(1))
    reader.relocate(pos(2))
    reader.relocate(pos(3))
    await vi.advanceTimersByTimeAsync(0)
    expect(save).toHaveBeenCalledTimes(1)
    expect(save).toHaveBeenLastCalledWith(id, {
      format: 'epub',
      cfi: 'epubcfi(/6/1)',
      progress: 0.01,
    })

    await vi.advanceTimersByTimeAsync(LOCATOR_SAVE_INTERVAL - 1)
    expect(save).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(save).toHaveBeenCalledTimes(2)
    expect(save).toHaveBeenLastCalledWith(id, {
      format: 'epub',
      cfi: 'epubcfi(/6/3)',
      progress: 0.03,
    })
    expect((await core.getLocator(id))?.cfi).toBe('epubcfi(/6/3)')
    expect((await core.getWork(id))?.progress).toBe(0.03)
    stop()
  })

  it('sauvegarde immédiatement au démontage et en arrière-plan', async () => {
    vi.useFakeTimers()
    const save = vi.spyOn(core, 'saveLocator')
    const { reader, stop } = mount(id)
    await reader.load()

    reader.relocate(pos(1))
    reader.relocate(pos(5))
    await vi.advanceTimersByTimeAsync(0)
    expect(save).toHaveBeenCalledTimes(1)

    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    document.dispatchEvent(new Event('visibilitychange'))
    await vi.advanceTimersByTimeAsync(0)
    expect(save).toHaveBeenCalledTimes(2)
    expect((await core.getLocator(id))?.cfi).toBe('epubcfi(/6/5)')

    reader.relocate(pos(7))
    stop()
    await vi.advanceTimersByTimeAsync(0)
    expect((await core.getLocator(id))?.cfi).toBe('epubcfi(/6/7)')

    // Rien de neuf : la sauvegarde différée ne réécrit pas la même position.
    await vi.advanceTimersByTimeAsync(LOCATOR_SAVE_INTERVAL * 2)
    expect(save).toHaveBeenCalledTimes(3)
  })

  it('sauvegarde avant la fermeture de la page', async () => {
    vi.useFakeTimers()
    const { reader, stop } = mount(id)
    await reader.load()
    reader.relocate(pos(1))
    reader.relocate(pos(9))
    window.dispatchEvent(new Event('beforeunload'))
    await vi.advanceTimersByTimeAsync(0)
    expect((await core.getLocator(id))?.cfi).toBe('epubcfi(/6/9)')
    stop()
  })

  it('reprend la copie locale d’une position que le cœur n’a pas reçue', async () => {
    await core.saveLocator(id, { format: 'epub', cfi: 'epubcfi(/6/2)', progress: 0.2 })
    // Rechargement pendant l'écriture : seule la copie synchrone connaît la dernière page.
    const later = new Date(Date.now() + 1000)
    writeLocatorBackup(id, { format: 'epub', cfi: 'epubcfi(/6/6)', progress: 0.6 }, later)
    const { reader, stop } = mount(id)
    await reader.load()
    expect(reader.initialCfi.value).toBe('epubcfi(/6/6)')
    expect((await core.getLocator(id))?.cfi).toBe('epubcfi(/6/6)')
    expect((await core.getWork(id))?.progress).toBe(0.6)
    expect(readLocatorBackup(id)).toBeNull()
    stop()
  })

  it('flush se résout une fois la dernière position enregistrée', async () => {
    const { reader, stop } = mount(id)
    await reader.load()
    reader.relocate(pos(1))
    reader.relocate(pos(8))
    await reader.flush()
    expect((await core.getLocator(id))?.cfi).toBe('epubcfi(/6/8)')
    expect((await core.getWork(id))?.progress).toBe(0.08)
    stop()
  })

  it('ajoute et retire un marque-page à la position courante', async () => {
    const { reader, stop } = mount(id)
    await reader.load()
    reader.relocate(pos(4))
    expect(reader.currentBookmark.value).toBeUndefined()

    await reader.toggleBookmark()
    expect(reader.currentBookmark.value?.label).toBe('Chapitre 4')
    expect(await core.listBookmarks(id)).toHaveLength(1)

    await reader.toggleBookmark()
    expect(reader.currentBookmark.value).toBeUndefined()
    expect(await core.listBookmarks(id)).toHaveLength(0)
    stop()
  })
})
