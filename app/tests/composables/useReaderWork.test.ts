import { flushPromises } from '@vue/test-utils'
import { mockNuxtImport } from '@nuxt/test-utils/runtime'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CoreBridge } from '~/services/core/bridge'
import { MemoryBridge } from '~/services/core/memory'
import { sampleSeries, sampleWorks } from '../fixtures'

const { bridge } = vi.hoisted(() => ({ bridge: { current: null as CoreBridge | null } }))

mockNuxtImport('useCore', () => () => bridge.current!)

describe('useReaderWork', () => {
  beforeEach(() => {
    bridge.current = new MemoryBridge({ works: sampleWorks, series: sampleSeries })
  })

  it('charge une œuvre seule', async () => {
    const reader = useReaderWork('bovary')
    expect(reader.state.value).toBe('loading')
    await flushPromises()
    expect(reader.state.value).toBe('ready')
    expect(reader.work.value?.id).toBe('bovary')
  })

  it("charge le volume exact d'une série, sans le résoudre vers la série", async () => {
    const reader = useReaderWork('nemo-10')
    await flushPromises()
    expect(reader.state.value).toBe('ready')
    expect(reader.work.value?.id).toBe('nemo-10')
    expect(reader.work.value?.volume).toBe(10)
  })

  it('signale une œuvre introuvable, y compris un identifiant de série', async () => {
    const missing = useReaderWork('inconnu')
    const series = useReaderWork('s-nemo')
    await flushPromises()
    expect(missing.state.value).toBe('not-found')
    expect(missing.work.value).toBeNull()
    expect(series.state.value).toBe('not-found')
  })

  it("signale l'erreur du cœur puis se recharge", async () => {
    const core = bridge.current!
    const spy = vi.spyOn(core, 'getWork').mockRejectedValueOnce(new Error('boum'))
    const reader = useReaderWork('bovary')
    await flushPromises()
    expect(reader.state.value).toBe('error')
    expect(reader.error.value).toBe('boum')
    await reader.load()
    expect(reader.state.value).toBe('ready')
    expect(reader.error.value).toBeNull()
    expect(spy).toHaveBeenCalledTimes(2)
  })

  it("se recharge quand l'identifiant change et ignore une réponse périmée", async () => {
    const id = ref('nemo-10')
    const reader = useReaderWork(id)
    await flushPromises()
    expect(reader.work.value?.id).toBe('nemo-10')

    id.value = 'nemo-2'
    await flushPromises()
    expect(reader.work.value?.id).toBe('nemo-2')

    // Deux changements rapprochés : seule la dernière réponse compte.
    const core = bridge.current!
    const real = core.getWork.bind(core)
    let release!: () => void
    vi.spyOn(core, 'getWork').mockImplementationOnce(async (requested) => {
      await new Promise<void>((resolve) => (release = resolve))
      return real(requested)
    })
    id.value = 'bovary'
    await nextTick()
    id.value = 'horla'
    await flushPromises()
    expect(reader.work.value?.id).toBe('horla')
    release()
    await flushPromises()
    expect(reader.work.value?.id).toBe('horla')
  })
})
