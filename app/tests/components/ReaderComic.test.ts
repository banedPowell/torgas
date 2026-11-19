import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ReaderComic from '~/components/reader/ReaderComic.vue'
import { COMIC_SETTINGS_KEY } from '~/composables/useComicSettings'
import type { CoreBridge } from '~/services/core/bridge'
import { MemoryBridge } from '~/services/core/memory'
import { oneShot, svgPages, testSeries, volume1, volume2 } from '../comic-fixtures'

const { bridge } = vi.hoisted(() => ({ bridge: { current: null as CoreBridge | null } }))

mockNuxtImport('useCore', () => () => bridge.current!)

async function mount(work = oneShot) {
  const wrapper = await mountSuspended(ReaderComic, { props: { work }, attachTo: document.body })
  await vi.waitFor(() => expect(wrapper.find('img[alt^="Page"]').exists()).toBe(true))
  return wrapper
}

function press(key: string) {
  document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
}

describe('ReaderComic', () => {
  beforeEach(() => {
    localStorage.setItem(COMIC_SETTINGS_KEY, JSON.stringify({ layout: 'single', fit: 'screen' }))
    clearNuxtState()
    bridge.current = new MemoryBridge({
      works: [volume1, volume2, oneShot],
      series: [testSeries],
      pages: { [volume1.id]: svgPages(6), [volume2.id]: svgPages(4), [oneShot.id]: svgPages(5) },
    })
  })

  it('affiche la page avec un texte alternatif et le compteur', async () => {
    const wrapper = await mount()
    expect(wrapper.find('img').attributes('alt')).toBe('Page 1 sur 5')
    expect(wrapper.text()).toContain('1 / 5')
    wrapper.unmount()
  })

  it('tourne les pages au clavier et émet close sur Échap', async () => {
    const wrapper = await mount()
    press('ArrowRight')
    await vi.waitFor(() => expect(wrapper.find('img').attributes('alt')).toBe('Page 2 sur 5'))
    press('ArrowLeft')
    await vi.waitFor(() => expect(wrapper.find('img').attributes('alt')).toBe('Page 1 sur 5'))
    press('Escape')
    expect(wrapper.emitted('close')).toHaveLength(1)
    wrapper.unmount()
  })

  it('inverse les flèches en lecture droite → gauche', async () => {
    const wrapper = await mount(volume1)
    press('ArrowLeft')
    await vi.waitFor(() => expect(wrapper.find('img').attributes('alt')).toBe('Page 2 sur 6'))
    wrapper.unmount()
  })

  it('propose le volume suivant en fin de volume', async () => {
    const wrapper = await mount(volume1)
    for (let i = 0; i < 6; i++) press('ArrowLeft')
    await vi.waitFor(() => expect(wrapper.text()).toContain('À suivre : volume 2'))
    expect(wrapper.find(`a[href="/read/${volume2.id}"]`).exists()).toBe(true)
    wrapper.unmount()
  })

  it('propose le retour à la série sans volume suivant', async () => {
    const wrapper = await mount(volume2)
    for (let i = 0; i < 4; i++) press('ArrowLeft')
    await vi.waitFor(() => expect(wrapper.text()).toContain('Volume terminé'))
    expect(wrapper.find(`a[href="/works/${volume2.id}"]`).text()).toContain('Retour à la série')
    wrapper.unmount()
  })

  it('montre une erreur avec un bouton réessayer quand une page échoue', async () => {
    bridge.current!.getPageUrl = () => Promise.reject(new Error('illisible'))
    const wrapper = await mountSuspended(ReaderComic, { props: { work: oneShot } })
    await vi.waitFor(() => expect(wrapper.text()).toContain("Impossible d'afficher la page 1."))
    expect(wrapper.find('[role="alert"] button').text()).toContain('Réessayer')
    wrapper.unmount()
  })
})
