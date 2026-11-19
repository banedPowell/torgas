import { mockNuxtImport } from '@nuxt/test-utils/runtime'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope } from 'vue'
import { MemoryBridge } from '~/services/core/memory'
import type { Locator } from '~/types/core'
import { readLocatorBackup, writeLocatorBackup } from '~/utils/locatorBackup'

const { bridge } = vi.hoisted(() => ({ bridge: { current: null as MemoryBridge | null } }))

mockNuxtImport('useCore', () => () => bridge.current!)

const INTERVAL = 2000
const page = (n: number): Locator => ({ format: 'cbz', page: n, progress: n / 10 })

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((res) => (resolve = res))
  return { promise, resolve }
}

function mount(id: string) {
  const scope = effectScope()
  const saver = scope.run(() => useLocatorSaver(id, { interval: INTERVAL }))!
  return { saver, stop: () => scope.stop() }
}

describe('useLocatorSaver', () => {
  let core: MemoryBridge
  let id: string

  beforeEach(async () => {
    localStorage.clear()
    core = new MemoryBridge()
    bridge.current = core
    id = (await core.importFile('Album.cbz', new Uint8Array([1, 2, 3]))).work!.id
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('copie chaque position dans localStorage, puis la retire une fois enregistrée', async () => {
    vi.useFakeTimers()
    const { saver, stop } = mount(id)
    saver.track(page(1))
    saver.track(page(2))
    // Copie synchrone : présente avant même que le cœur ait répondu.
    expect(readLocatorBackup(id)?.locator).toEqual(page(2))
    await vi.advanceTimersByTimeAsync(INTERVAL)
    expect(await core.getLocator(id)).toEqual(page(2))
    expect(readLocatorBackup(id)).toBeNull()
    stop()
  })

  it('flush attend l’écriture en cours puis écrit la dernière position', async () => {
    vi.useFakeTimers()
    const gate = deferred()
    const save = core.saveLocator.bind(core)
    const spy = vi.spyOn(core, 'saveLocator').mockImplementationOnce(async (...args) => {
      await gate.promise
      return save(...args)
    })
    const { saver, stop } = mount(id)
    saver.track(page(1)) // écriture immédiate (bloquée)
    saver.track(page(4)) // différée par l'intervalle

    let flushed = false
    const flush = saver.flush().then(() => (flushed = true))
    await vi.advanceTimersByTimeAsync(0)
    expect(flushed).toBe(false)
    expect(spy).toHaveBeenCalledTimes(1)

    gate.resolve()
    await flush
    expect(spy).toHaveBeenCalledTimes(2)
    expect(await core.getLocator(id)).toEqual(page(4))
    // L'écriture différée n'a plus rien à faire.
    await vi.advanceTimersByTimeAsync(INTERVAL * 2)
    expect(spy).toHaveBeenCalledTimes(2)
    stop()
  })

  it('garde la position et la copie si le cœur échoue, et réessaie au flush suivant', async () => {
    const spy = vi.spyOn(core, 'saveLocator').mockRejectedValueOnce(new Error('panne'))
    const { saver, stop } = mount(id)
    saver.track(page(3)) // écriture immédiate, en échec
    await vi.waitFor(() => expect(spy).toHaveBeenCalledTimes(1))
    await Promise.resolve()
    expect(await core.getLocator(id)).toBeNull()
    expect(readLocatorBackup(id)?.locator).toEqual(page(3))
    await saver.flush()
    expect(spy).toHaveBeenCalledTimes(2)
    expect(await core.getLocator(id)).toEqual(page(3))
    expect(readLocatorBackup(id)).toBeNull()
    stop()
  })

  it('écrit la dernière position au démontage', async () => {
    const { saver, stop } = mount(id)
    saver.track(page(1))
    saver.track(page(5))
    stop()
    await vi.waitFor(async () => expect(await core.getLocator(id)).toEqual(page(5)))
  })

  it('restore : pousse dans le cœur une copie locale plus récente', async () => {
    await core.saveLocator(id, page(2))
    const lastReadAt = (await core.getWork(id))!.lastReadAt
    writeLocatorBackup(id, page(4), new Date(Date.parse(lastReadAt!) + 1000))
    const { saver, stop } = mount(id)
    expect(await saver.restore(page(2), lastReadAt)).toEqual(page(4))
    expect(await core.getLocator(id)).toEqual(page(4))
    expect(readLocatorBackup(id)).toBeNull()
    stop()
  })

  it('restore : ignore et efface une copie plus ancienne que la position du cœur', async () => {
    writeLocatorBackup(id, page(1), new Date(Date.now() - 60_000))
    await core.saveLocator(id, page(3))
    const { lastReadAt } = (await core.getWork(id))!
    const spy = vi.spyOn(core, 'saveLocator')
    const { saver, stop } = mount(id)
    expect(await saver.restore(page(3), lastReadAt)).toEqual(page(3))
    expect(spy).not.toHaveBeenCalled()
    expect(readLocatorBackup(id)).toBeNull()
    stop()
  })
})
