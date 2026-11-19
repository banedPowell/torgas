import { mockNuxtImport } from '@nuxt/test-utils/runtime'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope } from 'vue'
import { MemoryBridge } from '~/services/core/memory'

const { bridge } = vi.hoisted(() => ({ bridge: { current: null as MemoryBridge | null } }))

mockNuxtImport('useCore', () => () => bridge.current!)

const SECOND = 1000
const MINUTE = 60 * SECOND

/** Simule le passage de l'onglet en arrière-plan ou au premier plan. */
function setVisibility(state: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state })
  document.dispatchEvent(new Event('visibilitychange'))
}

describe('useReadingSession', () => {
  let core: MemoryBridge
  let id: string
  let ready: Ref<boolean>
  let progress: Ref<number>
  let page: Ref<number>

  /** Monte le composable dans une portée qu'on peut arrêter (comme un démontage). */
  function mount() {
    const scope = effectScope()
    const session = scope.run(() =>
      useReadingSession(id, { ready, progress: () => progress.value, activity: page }),
    )!
    return { session, stop: () => scope.stop() }
  }

  /** Laisse les promesses du cœur se résoudre. */
  const settle = () => vi.advanceTimersByTimeAsync(0)

  beforeEach(async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T10:00:00Z'))
    setVisibility('visible')
    clearNuxtState()
    core = new MemoryBridge()
    bridge.current = core
    id = (await core.importFile('Le Horla.epub', new TextEncoder().encode('epub'))).work!.id
    ready = ref(true)
    progress = ref(0)
    page = ref(0)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('ouvre la session quand le lecteur est prêt, pas avant', async () => {
    ready.value = false
    const { stop } = mount()
    await settle()
    expect(core.sessionsOf(id)).toHaveLength(0)

    ready.value = true
    await settle()
    expect(core.sessionsOf(id)).toHaveLength(1)
    expect(core.sessionsOf(id)[0]!.endedAt).toBeUndefined()
    stop()
  })

  it('clôt la session au démontage avec les minutes actives et la progression', async () => {
    const { stop } = mount()
    await settle()
    for (let i = 0; i < 3; i++) {
      await vi.advanceTimersByTimeAsync(MINUTE)
      page.value++
      await settle()
    }
    progress.value = 0.42
    stop()
    await settle()
    const [session] = core.sessionsOf(id)
    expect(session).toMatchObject({ minutes: 3, progress: 0.42 })
    expect(session!.endedAt).toBeDefined()
  })

  it('ne compte pas l’inactivité au-delà de 2 min', async () => {
    const { stop } = mount()
    await settle()
    await vi.advanceTimersByTimeAsync(20 * MINUTE)
    stop()
    await settle()
    expect(core.sessionsOf(id)[0]!.minutes).toBe(2)
  })

  it('reprend après une interaction (clic, touche, défilement)', async () => {
    const { stop } = mount()
    await settle()
    await vi.advanceTimersByTimeAsync(10 * MINUTE)
    for (const event of [
      new PointerEvent('pointerdown'),
      new KeyboardEvent('keydown', { key: 'a' }),
      new Event('scroll'),
    ]) {
      document.dispatchEvent(event)
      await vi.advanceTimersByTimeAsync(20 * SECOND)
    }
    stop()
    await settle()
    // 2 min avant l'inactivité + 60 s depuis la première interaction.
    expect(core.sessionsOf(id)[0]!.minutes).toBe(3)
  })

  it('relaie les interactions d’un document étranger (iframe du livre)', async () => {
    const { session, stop } = mount()
    await settle()
    const doc = document.implementation.createHTMLDocument('livre')
    session.listen(doc)
    await vi.advanceTimersByTimeAsync(10 * MINUTE)
    doc.dispatchEvent(new Event('pointerdown'))
    await vi.advanceTimersByTimeAsync(MINUTE)
    stop()
    await settle()
    expect(core.sessionsOf(id)[0]!.minutes).toBe(3)
  })

  it('met le chrono en pause quand l’onglet est caché', async () => {
    const { stop } = mount()
    await settle()
    await vi.advanceTimersByTimeAsync(MINUTE)
    setVisibility('hidden')
    await vi.advanceTimersByTimeAsync(30 * MINUTE)
    setVisibility('visible')
    await vi.advanceTimersByTimeAsync(MINUTE)
    stop()
    await settle()
    expect(core.sessionsOf(id)[0]!.minutes).toBe(2)
  })

  it('clôt avec 0 minute une session de moins de 30 s', async () => {
    const { stop } = mount()
    await settle()
    await vi.advanceTimersByTimeAsync(10 * SECOND)
    stop()
    await settle()
    const [session] = core.sessionsOf(id)
    expect(session!.minutes).toBe(0)
    expect(session!.endedAt).toBeDefined()
  })

  it('clôt une seule fois malgré pagehide, beforeunload et démontage', async () => {
    const end = vi.spyOn(core, 'endSession')
    const { stop } = mount()
    await settle()
    await vi.advanceTimersByTimeAsync(MINUTE)
    window.dispatchEvent(new Event('pagehide'))
    window.dispatchEvent(new Event('beforeunload'))
    stop()
    await settle()
    expect(end).toHaveBeenCalledTimes(1)
    expect(end.mock.calls[0]![1]).toBe(1)
  })

  it('clôt quand le lecteur n’est plus prêt', async () => {
    const { stop } = mount()
    await settle()
    await vi.advanceTimersByTimeAsync(MINUTE)
    ready.value = false
    await settle()
    expect(core.sessionsOf(id)[0]!.endedAt).toBeDefined()
    stop()
  })

  it('borne la progression transmise au cœur', async () => {
    const { stop } = mount()
    await settle()
    progress.value = 3
    stop()
    await settle()
    expect(core.sessionsOf(id)[0]!.progress).toBe(1)
  })

  it('ne casse pas la lecture si le cœur refuse la session', async () => {
    vi.spyOn(core, 'startSession').mockRejectedValue(new Error('base fermée'))
    const end = vi.spyOn(core, 'endSession')
    const { stop } = mount()
    await settle()
    stop()
    await settle()
    expect(end).not.toHaveBeenCalled()

    vi.spyOn(core, 'startSession').mockRestore()
    vi.spyOn(core, 'endSession').mockRejectedValue(new Error('base fermée'))
    const second = mount()
    await settle()
    expect(() => second.stop()).not.toThrow()
    await settle()
  })

  it('met à jour le statut et recharge la bibliothèque déjà chargée', async () => {
    const library = useLibrary()
    await library.load()
    expect(library.works.value[0]!.status).toBe('to_read')

    const { stop } = mount()
    await settle()
    await core.saveLocator(id, { format: 'epub', cfi: 'c', progress: 0.3 })
    progress.value = 0.3
    stop()
    await settle()
    expect(library.works.value[0]).toMatchObject({ status: 'reading', progress: 0.3 })
  })

  it('ne charge pas la bibliothèque si elle ne l’était pas', async () => {
    const listWorks = vi.spyOn(core, 'listWorks')
    const { stop } = mount()
    await settle()
    stop()
    await settle()
    expect(listWorks).not.toHaveBeenCalled()
  })
})
