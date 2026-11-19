import { describe, expect, it } from 'vitest'
import type { Work } from '~/types/core'
import type { SeriesChapterRow } from '~/types/work'
import {
  buildSeriesChapterRows,
  chapterGaps,
  chapterState,
  countMissing,
  formatIssueNumber,
  isChapter,
  matchesChapterQuery,
  nextChapter,
  sortChapters,
  splitSeriesWorks,
} from '~/utils/seriesChapters'
import { makeWork, nemo } from '../fixtures'

const chapter = (n: number, extra: Partial<Work> = {}) =>
  makeWork({
    id: `c${n}`,
    title: `Nemo c${n}`,
    kind: 'comic',
    format: 'cbz',
    seriesId: nemo.id,
    chapter: n,
    ...extra,
  })

const ids = (works: readonly Work[]) => works.map((w) => w.id)

function describeRows(rows: readonly SeriesChapterRow[]): string[] {
  return rows.map((row) => {
    if (row.kind === 'group') return `[${row.volume ?? '-'}:${row.count}]`
    if (row.kind === 'gap') return `?${row.from}-${row.to}`
    return String(row.number)
  })
}

describe('chapitres d’une série', () => {
  it('sépare volumes et chapitres', () => {
    const volume = makeWork({ id: 'v1', title: 'Nemo v1', volume: 1 })
    const { volumes, chapters } = splitSeriesWorks([chapter(2), volume, chapter(1)])
    expect(ids(volumes)).toEqual(['v1'])
    expect(ids(chapters)).toEqual(['c2', 'c1'])
    expect(isChapter(volume)).toBe(false)
    expect(isChapter(chapter(0))).toBe(true)
  })

  it('trie par numéro, décimaux compris', () => {
    expect(ids(sortChapters([chapter(10), chapter(2.5), chapter(2), chapter(1050)]))).toEqual([
      'c2',
      'c2.5',
      'c10',
      'c1050',
    ])
  })

  it('formate les numéros à la française', () => {
    expect(formatIssueNumber(1050)).toBe('1050')
    expect(formatIssueNumber(1050.5)).toBe('1050,5')
  })

  it('distingue lu, en cours et à lire, et trouve le prochain chapitre', () => {
    const read = chapter(1, { status: 'finished', progress: 1 })
    const current = chapter(2, { status: 'reading', progress: 0.3 })
    expect(chapterState(read)).toBe('read')
    expect(chapterState(current)).toBe('current')
    expect(chapterState(chapter(3))).toBe('unread')
    expect(nextChapter([chapter(3), current, read])?.id).toBe('c2')
    expect(nextChapter([read])).toBeUndefined()
  })

  it('repère les trous entre le premier et le dernier chapitre', () => {
    const gaps = chapterGaps([
      chapter(1000),
      chapter(1001),
      chapter(1004),
      chapter(1004.5),
      chapter(1006),
    ])
    expect(gaps).toEqual([
      { from: 1002, to: 1003, beforeId: 'c1004' },
      { from: 1005, to: 1005, beforeId: 'c1006' },
    ])
    expect(countMissing(gaps)).toBe(3)
    // Un chapitre décimal ne remplace pas l'entier : 7 manque entre 6 et 7,5.
    expect(chapterGaps([chapter(6), chapter(7.5), chapter(8)])).toEqual([
      { from: 7, to: 7, beforeId: 'c7.5' },
    ])
  })

  it('cherche par numéro (préfixe) ou par titre', () => {
    const honneur = chapter(1050, { chapterTitle: 'Honneur et Rêve' })
    expect(matchesChapterQuery(honneur, '105')).toBe(true)
    expect(matchesChapterQuery(honneur, '1050')).toBe(true)
    expect(matchesChapterQuery(honneur, 'ch. 1050')).toBe(true)
    expect(matchesChapterQuery(honneur, '#1050')).toBe(true)
    expect(matchesChapterQuery(honneur, '1051')).toBe(false)
    expect(matchesChapterQuery(honneur, 'reve')).toBe(true)
    expect(matchesChapterQuery(honneur, 'pirate')).toBe(false)
    expect(matchesChapterQuery(chapter(1050.5), '1050,5')).toBe(true)
    expect(matchesChapterQuery(chapter(12), '  ')).toBe(true)
  })
})

describe('buildSeriesChapterRows', () => {
  it('regroupe par volume, « Sans volume » en dernier, avec les trous', () => {
    const rows = buildSeriesChapterRows([
      chapter(5),
      chapter(1, { volume: 1 }),
      chapter(2, { volume: 1 }),
      chapter(4, { volume: 2 }),
      chapter(7),
    ])
    expect(describeRows(rows)).toEqual([
      '[1:2]',
      '1',
      '2',
      '[2:1]',
      '?3-3',
      '4',
      '[-:2]',
      '5',
      '?6-6',
      '7',
    ])
  })

  it('sans intitulé quand aucun chapitre n’a de volume', () => {
    expect(describeRows(buildSeriesChapterRows([chapter(2), chapter(1)]))).toEqual(['1', '2'])
  })

  it('filtre à la recherche, sans les trous', () => {
    const rows = buildSeriesChapterRows(
      [chapter(10, { volume: 1 }), chapter(12, { volume: 2 }), chapter(105, { volume: 11 })],
      '1',
    )
    expect(describeRows(rows)).toEqual(['[1:1]', '10', '[2:1]', '12', '[11:1]', '105'])
    expect(describeRows(buildSeriesChapterRows([chapter(10), chapter(12)], '12'))).toEqual(['12'])
    expect(buildSeriesChapterRows([chapter(10)], '99')).toEqual([])
  })

  it('reste rapide avec plusieurs milliers de chapitres', () => {
    const many = Array.from({ length: 3000 }, (_, i) =>
      chapter(i + 1, { volume: i < 2900 ? Math.floor(i / 10) + 1 : undefined }),
    )
    const start = performance.now()
    const rows = buildSeriesChapterRows(many)
    const search = buildSeriesChapterRows(many, '29')
    const elapsed = performance.now() - start
    expect(rows.filter((r) => r.kind === 'chapter')).toHaveLength(3000)
    expect(rows.filter((r) => r.kind === 'group')).toHaveLength(291)
    expect(rows.at(-1)).toMatchObject({ kind: 'chapter', number: 3000 })
    // 29, 290…299, 2900…2999.
    expect(search.filter((r) => r.kind === 'chapter')).toHaveLength(111)
    expect(elapsed).toBeLessThan(500)
  })
})
