import { describe, expect, it } from 'vitest'
import {
  buildBookCss,
  DEFAULT_READER_SETTINGS,
  readerKeyAction,
  readerTapAction,
  sanitizeReaderSettings,
  tapZone,
} from '~/utils/reader'

describe('sanitizeReaderSettings', () => {
  it('garde les valeurs valides et remplace les autres', () => {
    expect(sanitizeReaderSettings(null)).toEqual(DEFAULT_READER_SETTINGS)
    expect(
      sanitizeReaderSettings({ font: 'publisher', fontSize: 3, lineHeight: 1.234, margin: 'x' }),
    ).toEqual({ ...DEFAULT_READER_SETTINGS, font: 'publisher', fontSize: 14, lineHeight: 1.23 })
  })
})

describe('buildBookCss', () => {
  const colors = { background: 'rgb(0, 0, 0)', text: 'rgb(200, 190, 170)', link: 'red', dark: true }

  it('applique taille, interligne, couleurs et police', () => {
    const css = buildBookCss({ ...DEFAULT_READER_SETTINGS, fontSize: 21, lineHeight: 1.8 }, colors)
    expect(css).toContain('font-size: 21px')
    expect(css).toContain('line-height: 1.8')
    expect(css).toContain('background: rgb(0, 0, 0)')
    expect(css).toContain('color-scheme: dark')
    expect(css).toContain("font-family: 'Literata'")
  })

  it('laisse la police de l’éditeur', () => {
    const css = buildBookCss({ ...DEFAULT_READER_SETTINGS, font: 'publisher' }, colors)
    expect(css).not.toContain('Literata')
    expect(css).not.toContain('Atkinson')
  })
})

describe('actions du lecteur', () => {
  const key = (k: string, mods: Partial<KeyboardEvent> = {}) =>
    readerKeyAction({
      key: k,
      shiftKey: false,
      metaKey: false,
      ctrlKey: false,
      altKey: false,
      ...mods,
    })

  it('associe les touches aux actions', () => {
    expect(key('ArrowLeft')).toBe('left')
    expect(key('ArrowRight')).toBe('right')
    expect(key(' ')).toBe('next')
    expect(key(' ', { shiftKey: true })).toBe('prev')
    expect(key('Escape')).toBe('close')
    expect(key('ArrowRight', { metaKey: true })).toBeNull()
    expect(key('a')).toBeNull()
  })

  it('découpe l’écran en trois zones de tap', () => {
    expect(readerTapAction(0.1, 0.5)).toBe('left')
    expect(readerTapAction(0.5, 0.5)).toBe('toggle')
    expect(readerTapAction(0.9, 0.9)).toBe('right')
  })

  it('affiche la barre sur toute la bande du haut (#44)', () => {
    expect(tapZone(0.05, 0.1)).toBe('menu')
    expect(tapZone(0.95, 0.24)).toBe('menu')
    expect(tapZone(0.95, 0.25)).toBe('right')
    expect(readerTapAction(0.1, 0)).toBe('toggle')
  })
})
