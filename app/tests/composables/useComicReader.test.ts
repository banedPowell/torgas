import { mockNuxtImport } from '@nuxt/test-utils/runtime'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope } from 'vue'
import type { CoreBridge } from '~/services/core/bridge'
import { MemoryBridge } from '~/services/core/memory'
import type { Work } from '~/types/core'
import { COMIC_SETTINGS_KEY } from '~/composables/useComicSettings'
import { clearLocatorBackup, readLocatorBackup, writeLocatorBackup } from '~/utils/locatorBackup'
import { oneShot, svgPages, testSeries, volume1, volume2 } from '../comic-fixtures'

const { bridge } = vi.hoisted(() => ({ bridge: { current: null as CoreBridge | null } }))

mockNuxtImport('useCore', () => () => bridge.current!)

const portrait = ref({ width: 390, height: 844 })
const landscape = ref({ width: 1280, height: 800 })

function makeBridge() {
  return new MemoryBridge({
    works: [volume1, volume2, oneShot],
    series: [testSeries],
    pages: { [volume1.id]: svgPages(6), [volume2.id]: svgPages(4), [oneShot.id]: svgPages(5) },
  })
}

/** Ouvre le lecteur dans un scope détachable, comme le ferait un composant. */
const scopes: ReturnType<typeof effectScope>[] = []

async function open(work: Work, viewport = portrait) {
  const scope = effectScope()
  scopes.push(scope)
  const reader = scope.run(() => useComicReader(work, { viewport }))!
  await vi.waitFor(() => expect(reader.state.value).not.toBe('loading'))
  return { reader, scope }
}

describe('useComicReader', () => {
  afterEach(() => scopes.splice(0).forEach((scope) => scope.stop()))

  beforeEach(() => {
    localStorage.removeItem(COMIC_SETTINGS_KEY)
    for (const id of [volume1.id, volume2.id, oneShot.id]) clearLocatorBackup(id)
    clearNuxtState()
    bridge.current = makeBridge()
  })

  it('ouvre au début et lit le sens de la série', async () => {
    const { reader } = await open(volume1)
    expect(reader.state.value).toBe('ready')
    expect(reader.pageCount.value).toBe(6)
    expect(reader.page.value).toBe(0)
    expect(reader.layout.value).toBe('single')
    expect(reader.direction.value).toBe('rtl')
    expect(reader.nextWork.value?.id).toBe(volume2.id)
    expect(reader.isFirst.value).toBe(true)
  })

  it('reprend à la page sauvegardée', async () => {
    await bridge.current!.saveLocator(volume1.id, { format: 'cbz', page: 3, progress: 4 / 6 })
    const { reader } = await open(volume1)
    expect(reader.page.value).toBe(3)
  })

  it('reprend depuis la progression si le locator n’a pas de page', async () => {
    await bridge.current!.saveLocator(oneShot.id, { format: 'cbz', progress: 0.6 })
    const { reader } = await open(oneShot)
    expect(reader.page.value).toBe(2)
  })

  it('avance, recule et atteint la fin du volume', async () => {
    const { reader } = await open(oneShot)
    expect(reader.direction.value).toBe('ltr')
    reader.next()
    reader.next()
    expect(reader.page.value).toBe(2)
    reader.prev()
    expect(reader.page.value).toBe(1)
    reader.goTo(4)
    expect(reader.progress.value).toBe(1)
    expect(reader.ended.value).toBe(false)
    reader.next()
    expect(reader.ended.value).toBe(true)
    reader.next()
    expect(reader.ended.value).toBe(true)
    reader.prev()
    expect(reader.ended.value).toBe(false)
    expect(reader.page.value).toBe(4)
    reader.goTo(99)
    expect(reader.page.value).toBe(4)
  })

  it('respecte le sens droite → gauche pour les côtés', async () => {
    const { reader } = await open(volume1)
    reader.goSide('left')
    expect(reader.page.value).toBe(1)
    reader.goSide('right')
    expect(reader.page.value).toBe(0)
    reader.goSide('right')
    expect(reader.page.value).toBe(0)
  })

  it('passe en double page en paysage, couverture seule, ordre inversé en rtl', async () => {
    const { reader } = await open(volume1, landscape)
    expect(reader.layout.value).toBe('double')
    expect(reader.visiblePages.value).toEqual([0])
    reader.next()
    expect(reader.page.value).toBe(1)
    expect(reader.visiblePages.value).toEqual([2, 1])
    expect(reader.progress.value).toBe(0.5)
    reader.next()
    reader.next()
    expect(reader.visiblePages.value).toEqual([5])
  })

  it('suit les réglages de mise en page', async () => {
    const { reader } = await open(oneShot, landscape)
    useComicSettings().setLayout('single')
    await vi.waitFor(() => expect(reader.layout.value).toBe('single'))
    useComicSettings().setLayout('webtoon')
    await vi.waitFor(() => expect(reader.layout.value).toBe('webtoon'))
    reader.setVisiblePage(3)
    expect(reader.page.value).toBe(3)
  })

  it('change le sens de la série dans le cœur', async () => {
    const { reader } = await open(volume1)
    await reader.toggleDirection()
    expect(reader.direction.value).toBe('ltr')
    const [series] = await bridge.current!.listSeries()
    expect(series?.direction).toBe('ltr')
  })

  it('garde le sens localement pour une œuvre hors série', async () => {
    const { reader } = await open(oneShot)
    await reader.setDirection('rtl')
    expect(reader.direction.value).toBe('rtl')
    expect(reader.series.value).toBeNull()
  })

  it('annule le changement de sens si le cœur échoue', async () => {
    bridge.current!.setSeriesDirection = () => Promise.reject(new Error('panne'))
    const { reader } = await open(volume1)
    await expect(reader.setDirection('ltr')).rejects.toThrow('panne')
    expect(reader.direction.value).toBe('rtl')
  })

  it('n’a pas de volume suivant en fin de série', async () => {
    const { reader } = await open(volume2)
    expect(reader.nextWork.value).toBeNull()
  })

  it('précharge les 3 pages suivantes', async () => {
    const spy = vi.spyOn(bridge.current!, 'getPageUrl')
    const { reader } = await open(oneShot)
    await vi.waitFor(() => expect(spy).toHaveBeenCalledTimes(3))
    expect(spy.mock.calls.map(([, p]) => p)).toEqual([1, 2, 3])
    reader.next()
    await vi.waitFor(() => expect(spy.mock.calls.map(([, p]) => p)).toContain(4))
  })

  it('mémorise les URL de page et les redemande sur erreur', async () => {
    const { reader } = await open(oneShot)
    const spy = vi.spyOn(bridge.current!, 'getPageUrl')
    const url = await reader.pageUrl(0)
    expect(url).toMatch(/^data:image\/svg\+xml,/)
    await reader.pageUrl(0)
    expect(spy).toHaveBeenCalledTimes(1)
    await reader.pageUrl(0, true)
    expect(spy).toHaveBeenCalledTimes(2)
    await expect(reader.pageUrl(42)).rejects.toThrow()
  })

  it('sauvegarde la position au fil de la lecture et à la fermeture', async () => {
    const { reader, scope } = await open(volume1)
    reader.next()
    await vi.waitFor(async () =>
      expect((await bridge.current!.getLocator(volume1.id))?.page).toBe(1),
    )
    reader.goTo(5)
    reader.next()
    scope.stop()
    await vi.waitFor(async () =>
      expect(await bridge.current!.getLocator(volume1.id)).toEqual({
        format: 'cbz',
        page: 5,
        progress: 1,
      }),
    )
    expect((await bridge.current!.getWork(volume1.id))?.progress).toBe(1)
  })

  it('sauvegarde quand la page passe en arrière-plan', async () => {
    const { reader } = await open(oneShot)
    const spy = vi.spyOn(bridge.current!, 'saveLocator')
    reader.goTo(1)
    // Page suivante dans l'intervalle de 2 s : sa sauvegarde est différée…
    reader.goTo(2)
    await vi.waitFor(() => expect(spy).toHaveBeenCalledTimes(1))
    spy.mockClear()
    // … sauf si la page passe en arrière-plan : elle est écrite tout de suite.
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
    await vi.waitFor(() =>
      expect(spy).toHaveBeenCalledWith(oneShot.id, { format: 'cbz', page: 2, progress: 0.6 }),
    )
  })

  it('reprend la copie locale si la dernière page n’a pas atteint le cœur', async () => {
    await bridge.current!.saveLocator(oneShot.id, { format: 'cbz', page: 1, progress: 0.4 })
    // Page déchargée pendant l'écriture : seule la copie synchrone a la page 3.
    const later = new Date(Date.now() + 1000)
    writeLocatorBackup(oneShot.id, { format: 'cbz', page: 3, progress: 0.8 }, later)
    const { reader } = await open(oneShot)
    expect(reader.page.value).toBe(3)
    expect(await bridge.current!.getLocator(oneShot.id)).toEqual({
      format: 'cbz',
      page: 3,
      progress: 0.8,
    })
    expect(readLocatorBackup(oneShot.id)).toBeNull()
  })

  it('passe en erreur pour un volume sans pages', async () => {
    const empty = { ...oneShot, id: 'vide', pageCount: 0 }
    bridge.current = new MemoryBridge({ works: [empty] })
    const { reader } = await open(empty)
    expect(reader.state.value).toBe('error')
    expect(reader.error.value).toBe('empty')
  })

  it('passe en erreur si le cœur échoue', async () => {
    const core = bridge.current!
    const listSeries = core.listSeries.bind(core)
    core.listSeries = () => Promise.reject(new Error('panne'))
    const { reader } = await open(volume1)
    expect(reader.state.value).toBe('error')
    expect(reader.error.value).toBe('panne')
    core.listSeries = listSeries
    await reader.load()
    expect(reader.state.value).toBe('ready')
  })
})

describe('useComicSettings', () => {
  beforeEach(() => {
    localStorage.removeItem(COMIC_SETTINGS_KEY)
    clearNuxtState()
  })

  it('persiste et assainit les réglages', () => {
    const settings = useComicSettings()
    expect(settings.layout.value).toBe('auto')
    expect(settings.fit.value).toBe('screen')
    settings.setFit('width')
    settings.setLayout('double')
    expect(JSON.parse(localStorage.getItem(COMIC_SETTINGS_KEY)!)).toEqual({
      layout: 'double',
      fit: 'width',
    })
    settings.reset()
    expect(settings.layout.value).toBe('auto')
  })

  it('ignore des valeurs inconnues', () => {
    localStorage.setItem(COMIC_SETTINGS_KEY, JSON.stringify({ layout: 'spirale', fit: 42 }))
    const settings = useComicSettings()
    expect(settings.layout.value).toBe('auto')
    expect(settings.fit.value).toBe('screen')
  })
})
