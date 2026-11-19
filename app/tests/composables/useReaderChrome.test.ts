import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope } from 'vue'

function mount() {
  const scope = effectScope()
  return { chrome: scope.run(() => useReaderChrome())!, stop: () => scope.stop() }
}

describe('useReaderChrome', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('se masque seule après 3 s', () => {
    const { chrome, stop } = mount()
    expect(chrome.visible.value).toBe(true)
    vi.advanceTimersByTime(CHROME_HIDE_DELAY - 1)
    expect(chrome.visible.value).toBe(true)
    vi.advanceTimersByTime(1)
    expect(chrome.visible.value).toBe(false)
    chrome.toggle()
    expect(chrome.visible.value).toBe(true)
    stop()
  })

  it('reste visible tant qu’un panneau est ouvert', () => {
    const { chrome, stop } = mount()
    chrome.setPinned(true)
    vi.advanceTimersByTime(CHROME_HIDE_DELAY * 2)
    chrome.hide()
    expect(chrome.visible.value).toBe(true)
    chrome.setPinned(false)
    vi.advanceTimersByTime(CHROME_HIDE_DELAY)
    expect(chrome.visible.value).toBe(false)
    stop()
  })
})
