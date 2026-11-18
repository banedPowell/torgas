import { flushPromises } from '@vue/test-utils'
import { mockNuxtImport } from '@nuxt/test-utils/runtime'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CoreBridge } from '~/services/core/bridge'
import { MemoryBridge } from '~/services/core/memory'
import { makeWork, nemo, sampleSeries, sampleWorks } from '../fixtures'

const { bridge, toasts } = vi.hoisted(() => ({
  bridge: { current: null as CoreBridge | null },
  toasts: [] as { title?: string; color?: string }[],
}))

mockNuxtImport('useCore', () => () => bridge.current!)
mockNuxtImport('useToast', () => () => ({ add: (toast: { title?: string }) => toasts.push(toast) }))

/** Série de 8 volumes dont les volumes 4 et 7 manquent. */
function incompleteSeries() {
  return [1, 2, 3, 5, 6, 8].map((n) =>
    makeWork({
      id: `s-${n}`,
      title: `Tome ${n}`,
      kind: 'comic',
      format: 'cbz',
      seriesId: nemo.id,
      volume: n,
      status: n <= 2 ? 'finished' : n === 3 ? 'reading' : 'to_read',
      progress: n <= 2 ? 1 : n === 3 ? 0.4 : 0,
      sizeBytes: 100,
    }),
  )
}

async function open(id: string) {
  const fiche = useWork(id)
  await flushPromises()
  return fiche
}

describe('useWork', () => {
  beforeEach(() => {
    bridge.current = new MemoryBridge({ works: sampleWorks, series: sampleSeries })
    toasts.length = 0
    clearNuxtState()
  })

  it('charge une œuvre seule', async () => {
    const fiche = await open('bovary')
    expect(fiche.state.value).toBe('ready')
    expect(fiche.work.value?.title).toBe('Madame Bovary')
    expect(fiche.isSeries.value).toBe(false)
    expect(fiche.series.value).toBeNull()
    expect(fiche.volumes.value).toEqual([])
    expect(fiche.status.value).toBe('reading')
    expect(fiche.progress.value).toBe(0.09)
    expect(fiche.readTarget.value?.id).toBe('bovary')
    expect(fiche.action.value).toEqual({ kind: 'resume', percent: 9 })
    expect(fiche.meta.value?.isSeries).toBe(false)
  })

  it('charge une série par son identifiant, volumes triés et prochain volume', async () => {
    const fiche = await open(nemo.id)
    expect(fiche.state.value).toBe('ready')
    expect(fiche.isSeries.value).toBe(true)
    expect(fiche.work.value).toBeNull()
    expect(fiche.volumes.value.map((v) => v.id)).toEqual(['nemo-2', 'nemo-10'])
    expect(fiche.next.value?.id).toBe('nemo-10')
    expect(fiche.readTarget.value?.id).toBe('nemo-10')
    expect(fiche.action.value).toEqual({ kind: 'read', percent: 0 })
    expect(fiche.summary.value).toEqual({ total: 2, finished: 1, progress: 0.5 })
    expect(fiche.status.value).toBe('reading')
    expect(fiche.meta.value?.title).toBe('Little Nemo')
  })

  it('ouvre la série depuis l’identifiant d’un volume', async () => {
    const fiche = await open('nemo-2')
    expect(fiche.isSeries.value).toBe(true)
    expect(fiche.series.value?.id).toBe(nemo.id)
  })

  it('signale une série incomplète et reprend au volume en cours', async () => {
    bridge.current = new MemoryBridge({ works: incompleteSeries(), series: sampleSeries })
    const fiche = await open(nemo.id)
    expect(fiche.missing.value).toEqual([4, 7])
    expect(fiche.next.value?.id).toBe('s-3')
    expect(fiche.action.value).toEqual({ kind: 'resume', percent: 40 })
    expect(fiche.rows.value.filter((r) => r.kind === 'gap')).toHaveLength(2)
  })

  it('propose de relire le premier volume quand tout est terminé', async () => {
    const done = incompleteSeries().map((w) => ({ ...w, status: 'finished' as const, progress: 1 }))
    bridge.current = new MemoryBridge({ works: done, series: sampleSeries })
    const fiche = await open(nemo.id)
    expect(fiche.next.value).toBeUndefined()
    expect(fiche.readTarget.value?.id).toBe('s-1')
    expect(fiche.action.value?.kind).toBe('reread')
    expect(fiche.status.value).toBe('finished')
  })

  it('reste prêt mais sans contenu quand l’identifiant est inconnu', async () => {
    const fiche = await open('absent')
    expect(fiche.state.value).toBe('ready')
    expect(fiche.meta.value).toBeNull()
    expect(fiche.work.value).toBeNull()
    expect(fiche.action.value).toBeNull()
  })

  it('passe en erreur si le cœur échoue, puis se rétablit au rechargement', async () => {
    const core = new MemoryBridge({ works: sampleWorks })
    let fail = true
    const getWork = core.getWork.bind(core)
    core.getWork = (id) => (fail ? Promise.reject(new Error('panne')) : getWork(id))
    bridge.current = core
    const fiche = await open('bovary')
    expect(fiche.state.value).toBe('error')
    expect(fiche.error.value).toBe('panne')

    fail = false
    await fiche.load()
    expect(fiche.state.value).toBe('ready')
    expect(fiche.error.value).toBeNull()
    expect(fiche.work.value?.id).toBe('bovary')
  })

  it('suit l’identifiant quand il change', async () => {
    const id = ref('bovary')
    const fiche = useWork(id)
    await flushPromises()
    expect(fiche.work.value?.id).toBe('bovary')
    id.value = 'horla'
    await flushPromises()
    expect(fiche.work.value?.id).toBe('horla')
  })

  it('change le statut via le cœur et prévient par un toast', async () => {
    const fiche = await open('eleves')
    expect(await fiche.setStatus('finished')).toBe(true)
    expect(fiche.work.value?.status).toBe('finished')
    expect((await bridge.current!.getWork('eleves'))?.status).toBe('finished')
    expect(toasts).toHaveLength(1)
    expect(toasts[0]?.color).toBe('success')
  })

  it('ne fait rien si le statut est inchangé ou s’il s’agit d’une série', async () => {
    const fiche = await open('eleves')
    expect(await fiche.setStatus('to_read')).toBe(false)
    const series = await open(nemo.id)
    expect(await series.setStatus('finished')).toBe(false)
    expect(toasts).toHaveLength(0)
  })

  it('signale par un toast d’erreur un statut refusé par le cœur', async () => {
    const fiche = await open('eleves')
    bridge.current!.setStatus = () => Promise.reject(new Error('disque plein'))
    expect(await fiche.setStatus('finished')).toBe(false)
    expect(fiche.work.value?.status).toBe('to_read')
    expect(toasts[0]?.color).toBe('error')
  })

  it('change le sens de lecture d’une série', async () => {
    const fiche = await open(nemo.id)
    expect(fiche.series.value?.direction).toBe('ltr')
    expect(await fiche.setDirection('rtl')).toBe(true)
    expect(fiche.series.value?.direction).toBe('rtl')
    expect((await bridge.current!.listSeries())[0]?.direction).toBe('rtl')
    expect(await fiche.setDirection('rtl')).toBe(false)
    expect(toasts).toHaveLength(1)
  })

  it('refuse un sens de lecture pour une œuvre seule', async () => {
    const fiche = await open('bovary')
    expect(await fiche.setDirection('rtl')).toBe(false)
  })
})
