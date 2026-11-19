import { describe, expect, it } from 'vitest'
import { clampProgress, formatAuthors, formatPercent, formatTitleList } from '~/utils/format'
import { compareRecentFirst, naturalCompare } from '~/utils/sort'

describe('format', () => {
  it('borne la progression entre 0 et 1', () => {
    expect(clampProgress(-0.2)).toBe(0)
    expect(clampProgress(1.4)).toBe(1)
    expect(clampProgress(Number.NaN)).toBe(0)
    expect(clampProgress(0.5)).toBe(0.5)
  })

  it('affiche un pourcentage à la française', () => {
    expect(formatPercent(0.09).replace(/\s/g, ' ')).toBe('9 %')
    expect(formatPercent(2).replace(/\s/g, ' ')).toBe('100 %')
  })

  it('joint les auteurs', () => {
    expect(formatAuthors([])).toBe('')
    expect(formatAuthors(['Flaubert'])).toBe('Flaubert')
    expect(formatAuthors(['Erckmann', ' Chatrian '])).toBe('Erckmann et Chatrian')
    expect(formatAuthors(['A', 'B', 'C'])).toBe('A, B et C')
  })

  it('joint les titres et résume les suivants', () => {
    const others = (n: number) => `${n} autres`
    expect(formatTitleList(['A'], others)).toBe('A')
    expect(formatTitleList(['A', 'B', 'C', 'D'], others)).toBe('A, B, C et D')
    expect(formatTitleList(['A', 'B', 'C', 'D', 'E'], others)).toBe('A, B, C et 2 autres')
  })
})

describe('sort', () => {
  it('trie naturellement, sans casse ni accents', () => {
    const titles = ['Tome 10', 'tome 2', 'Tome 1']
    expect(titles.sort(naturalCompare)).toEqual(['Tome 1', 'tome 2', 'Tome 10'])
    expect(naturalCompare('été', 'Ete')).toBe(0)
  })

  it('place les dates récentes d’abord et les absentes à la fin', () => {
    const dates = [undefined, '2026-01-01', '2026-03-01']
    expect(dates.sort(compareRecentFirst)).toEqual(['2026-03-01', '2026-01-01', undefined])
  })
})
