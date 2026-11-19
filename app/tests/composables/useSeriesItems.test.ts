import { describe, expect, it } from 'vitest'
import type { Work } from '~/types/core'

const work = (chapter?: number) => ({ id: String(Math.random()), chapter }) as unknown as Work

describe('useSeriesItems', () => {
  it('parle de volumes, de chapitres ou des deux', () => {
    const items = useSeriesItems()
    expect(items.describe([work(), work(), work()])).toBe('Les 3 volumes')
    expect(items.describe([work(1)])).toBe('Le chapitre')
    expect(items.describe([work(), work(), work(1), work(2)])).toBe(
      'Les 2 volumes et les 2 chapitres',
    )
    expect(items.short([work(), work(1), work(2)])).toBe('1 vol., 2 ch.')
    expect(items.deletionDescription([work(1), work(2)])).toMatch(
      /^Les 2 chapitres de la série, leurs fichiers/,
    )
  })
})
