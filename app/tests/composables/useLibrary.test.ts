import { mockNuxtImport } from '@nuxt/test-utils/runtime'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CoreBridge } from '~/services/core/bridge'
import { MemoryBridge } from '~/services/core/memory'
import { entryTitle } from '~/utils/library'
import { sampleSeries, sampleWorks } from '../fixtures'

const { bridge } = vi.hoisted(() => ({ bridge: { current: null as CoreBridge | null } }))

mockNuxtImport('useCore', () => () => bridge.current!)

describe('useLibrary', () => {
  beforeEach(() => {
    bridge.current = new MemoryBridge({ works: sampleWorks, series: sampleSeries })
    clearNuxtState()
    localStorage.clear()
  })

  it('charge les œuvres et regroupe les séries', async () => {
    const library = useLibrary()
    expect(library.state.value).toBe('idle')
    await library.ensureLoaded()
    expect(library.state.value).toBe('ready')
    expect(library.works.value).toHaveLength(5)
    expect(library.entries.value).toHaveLength(4)
    expect(library.counts.value.all).toBe(5)
    expect(library.resume.value?.id).toBe('bovary')
    expect(library.isEmpty.value).toBe(false)
    expect(library.virtualized.value).toBe(false)
  })

  it('applique filtres et tri, puis les réinitialise', async () => {
    const library = useLibrary()
    await library.load()

    library.setFormat('cbz')
    expect(library.entries.value.map(entryTitle)).toEqual(['Little Nemo'])
    expect(library.hasActiveFilters.value).toBe(true)

    library.resetFilters()
    library.setStatus('finished')
    library.setSort('title')
    expect(library.entries.value.map(entryTitle)).toEqual(['Le Horla', 'Little Nemo'])

    library.resetFilters()
    library.setQuery('hugo')
    expect(library.entries.value.map(entryTitle)).toEqual(['Les Misérables'])
  })

  it('partage son état entre les appels', async () => {
    await useLibrary().load()
    useLibrary().setView('list')
    expect(useLibrary().view.value).toBe('list')
    expect(useLibrary().works.value).toHaveLength(5)
  })

  it("ferme la barre Reprendre, la mémorise et la rouvre si l'œuvre est relue", async () => {
    const library = useLibrary()
    await library.load()
    expect(library.resume.value?.id).toBe('bovary')

    library.dismissResume()
    expect(library.resume.value).toBeUndefined()

    // Après rechargement de la page : l'état persisté masque toujours la même reprise.
    clearNuxtState()
    const reloaded = useLibrary()
    await reloaded.load()
    expect(reloaded.resume.value).toBeUndefined()

    // Relue après la fermeture : la barre réapparaît.
    const [bovary, ...others] = sampleWorks
    bridge.current = new MemoryBridge({
      works: [{ ...bovary!, lastReadAt: '2026-04-01T00:00:00.000Z' }, ...others],
      series: sampleSeries,
    })
    const reread = useLibrary()
    await reread.load()
    expect(reread.resume.value?.id).toBe('bovary')
  })

  it('rouvre la barre quand une autre œuvre devient la reprise', async () => {
    const library = useLibrary()
    await library.load()
    library.dismissResume()
    const [bovary, horla, ...others] = sampleWorks
    bridge.current = new MemoryBridge({
      works: [
        bovary!,
        { ...horla!, status: 'reading', progress: 0.2, lastReadAt: '2026-05-01T00:00:00.000Z' },
        ...others,
      ],
      series: sampleSeries,
    })
    const next = useLibrary()
    await next.load()
    expect(next.resume.value?.id).toBe('horla')
  })

  it('signale une bibliothèque vide', async () => {
    bridge.current = new MemoryBridge()
    const library = useLibrary()
    await library.load()
    expect(library.isEmpty.value).toBe(true)
    expect(library.resume.value).toBeUndefined()
  })

  it('passe en erreur si le cœur échoue', async () => {
    bridge.current = new MemoryBridge()
    bridge.current.listWorks = () => Promise.reject(new Error('panne'))
    const library = useLibrary()
    await library.load()
    expect(library.state.value).toBe('error')
    expect(library.error.value).toBe('panne')
  })

  it('virtualise au-delà de 200 œuvres', async () => {
    bridge.current = new MemoryBridge({
      works: Array.from({ length: 201 }, (_, i) => ({
        ...sampleWorks[0]!,
        id: `w${i}`,
        title: `Œuvre ${i}`,
        sha256: String(i),
      })),
    })
    const library = useLibrary()
    await library.load()
    expect(library.virtualized.value).toBe(true)
  })
})

describe('MemoryBridge', () => {
  it('importe, dédoublonne et refuse les formats inconnus', async () => {
    const core = new MemoryBridge()
    const bytes = new TextEncoder().encode('contenu')
    const first = await core.importFile('Le Horla.epub', bytes)
    expect(first.status).toBe('imported')
    expect(first.work?.title).toBe('Le Horla')
    expect(first.work?.sha256).toHaveLength(64)
    expect((await core.importFile('copie.epub', bytes)).status).toBe('duplicate')
    expect((await core.importFile('livre.pdf', bytes)).status).toBe('unsupported')
    expect(await core.listWorks()).toHaveLength(1)
  })

  it('sauvegarde la position et met à jour la progression', async () => {
    const core = new MemoryBridge({ works: sampleWorks })
    await core.saveLocator('eleves', { format: 'epub', cfi: 'epubcfi(/6/4)', progress: 0.3 })
    expect((await core.getLocator('eleves'))?.cfi).toBe('epubcfi(/6/4)')
    expect((await core.getWork('eleves'))?.progress).toBe(0.3)
  })
})
