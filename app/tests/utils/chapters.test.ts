import { describe, expect, it } from 'vitest'
import type { ReaderTocEntry } from '~/types/reader'
import { buildChapterRows, currentChapter, sectionFractionsOf } from '~/utils/chapters'

const entry = (label: string, index: number, depth = 0, offset = 0): ReaderTocEntry => ({
  label,
  href: `s${index}.xhtml`,
  depth,
  index,
  offset,
})

describe('chapters utils', () => {
  it('calcule le début des sections comme foliate (sections non linéaires à 0)', () => {
    expect(sectionFractionsOf([{ size: 100 }, { size: 300, linear: 'no' }, { size: 300 }])).toEqual(
      [0, 0.25, 0.25, 1],
    )
    expect(sectionFractionsOf([])).toEqual([])
  })

  it('marque les chapitres lus, le courant et ceux à lire', () => {
    const fractions = [0, 0.25, 0.5, 0.75, 1]
    const rows = buildChapterRows(
      [entry('Un', 0), entry('Deux', 1), entry('Trois', 2), entry('Quatre', 3)],
      fractions,
      0.6,
    )
    expect(rows.map((r) => r.kind === 'chapter' && [r.number, r.state])).toEqual([
      [1, 'read'],
      [2, 'read'],
      [3, 'current'],
      [4, 'unread'],
    ])
    expect(currentChapter(rows)).toMatchObject({ label: 'Trois' })
    expect(currentChapter(rows)?.progress).toBeCloseTo(0.4)
  })

  it("n'a pas de chapitre courant avant la première lecture", () => {
    const rows = buildChapterRows([entry('Un', 0), entry('Deux', 1)], [0, 0.5, 1], 0)
    expect(rows.every((r) => r.kind === 'chapter' && r.state === 'unread')).toBe(true)
    expect(currentChapter(rows)).toBeUndefined()
  })

  it('fait des entrées parentes des intitulés de partie, sans numéro', () => {
    const rows = buildChapterRows(
      [entry('Première partie', 0), entry('I', 0, 1), entry('II', 1, 1), entry('Fin', 2)],
      [0, 0.4, 0.8, 1],
      1,
    )
    expect(rows.map((r) => (r.kind === 'part' ? r.label : `${r.number} ${r.state}`))).toEqual([
      'Première partie',
      '1 read',
      '2 read',
      '3 read',
    ])
  })

  it('situe un chapitre au milieu de sa section', () => {
    const rows = buildChapterRows([entry('A', 0), entry('B', 0, 0, 0.5)], [0, 1], 0.4)
    expect(rows.map((r) => r.kind === 'chapter' && r.state)).toEqual(['current', 'unread'])
  })
})
