import { mockNuxtImport } from '@nuxt/test-utils/runtime'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_READER_SETTINGS } from '~/utils/reader'

const { colorMode } = vi.hoisted(() => ({ colorMode: { value: 'light' } }))

mockNuxtImport('useColorMode', () => () => colorMode)

describe('useReaderSettings', () => {
  beforeEach(() => {
    localStorage.clear()
    clearNuxtState()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('part des réglages par défaut, thème selon le mode de l’app', () => {
    const { settings, resolvedTheme } = useReaderSettings()
    expect(settings.value).toEqual(DEFAULT_READER_SETTINGS)
    expect(resolvedTheme.value).toBe('paper')
    colorMode.value = 'dark'
    expect(useReaderSettings().resolvedTheme.value).toBe('dark')
    colorMode.value = 'light'
  })

  it('persiste les modifications et les partage', () => {
    const { update } = useReaderSettings()
    update({ fontSize: 22, theme: 'sepia', font: 'atkinson' })
    expect(useReaderSettings().settings.value).toMatchObject({
      fontSize: 22,
      theme: 'sepia',
      font: 'atkinson',
    })
    expect(useReaderSettings().resolvedTheme.value).toBe('sepia')
    expect(JSON.parse(localStorage.getItem(READER_SETTINGS_KEY)!)).toMatchObject({ fontSize: 22 })
  })

  it('relit le stockage et borne les valeurs invalides', () => {
    localStorage.setItem(
      READER_SETTINGS_KEY,
      JSON.stringify({ fontSize: 99, lineHeight: 'x', theme: 'black', font: 'comic' }),
    )
    const { settings } = useReaderSettings()
    expect(settings.value).toEqual({
      ...DEFAULT_READER_SETTINGS,
      fontSize: 28,
      theme: 'black',
    })
  })

  it('ignore un stockage corrompu ou indisponible', () => {
    localStorage.setItem(READER_SETTINGS_KEY, '{oups')
    expect(useReaderSettings().settings.value).toEqual(DEFAULT_READER_SETTINGS)

    clearNuxtState()
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })
    const { settings, update } = useReaderSettings()
    expect(settings.value).toEqual(DEFAULT_READER_SETTINGS)
    expect(() => update({ margin: 'wide' })).not.toThrow()
    expect(settings.value.margin).toBe('wide')
  })

  it('rétablit les valeurs par défaut', () => {
    const { settings, update, reset } = useReaderSettings()
    update({ lineHeight: 2, margin: 'narrow' })
    reset()
    expect(settings.value).toEqual(DEFAULT_READER_SETTINGS)
    expect(JSON.parse(localStorage.getItem(READER_SETTINGS_KEY)!)).toEqual(DEFAULT_READER_SETTINGS)
  })
})
