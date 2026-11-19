import { describe, expect, it } from 'vitest'
import {
  innerChapterWorks,
  isInnerChapter,
  readPath,
  seriesInnerChapters,
} from '~/utils/volumeChapters'
import { makeWork, nemo } from '../fixtures'

const volume = makeWork({
  id: 'v13',
  title: 'One Piece T013',
  format: 'cbz',
  seriesId: nemo.id,
  volume: 13,
  pageCount: 30,
})
const found = [
  { number: 109, page: 0 },
  { number: 110, page: 10, title: 'Le retour' },
  { number: 111, page: 20 },
]

describe('innerChapterWorks', () => {
  it('présente les chapitres du volume comme des chapitres de la série', () => {
    const chapters = innerChapterWorks(volume, found)
    expect(chapters.map((c) => [c.id, c.chapter, c.volume, c.chapterTitle])).toEqual([
      ['v13@0', 109, 13, undefined],
      ['v13@10', 110, 13, 'Le retour'],
      ['v13@20', 111, 13, undefined],
    ])
    expect(chapters.every(isInnerChapter)).toBe(true)
    expect(isInnerChapter(volume)).toBe(false)
  })

  it('déduit la progression de chaque chapitre de celle du volume', () => {
    const reading = innerChapterWorks({ ...volume, progress: 0.5, status: 'reading' }, found)
    expect(reading.map((c) => [c.progress, c.status])).toEqual([
      [1, 'finished'],
      [0.5, 'reading'],
      [0, 'to_read'],
    ])
    const done = innerChapterWorks({ ...volume, progress: 1, status: 'finished' }, found)
    expect(done.every((c) => c.status === 'finished')).toBe(true)
  })
})

describe('readPath', () => {
  it('ouvre le volume à la première page du chapitre', () => {
    expect(readPath({ id: 'v13@10' })).toBe('/read/v13?page=10')
    expect(readPath({ id: 'v13' })).toBe('/read/v13')
  })
})

describe('seriesInnerChapters', () => {
  it('laisse la place aux chapitres en fichier à part', () => {
    const file = makeWork({ id: 'c110', title: 'Saga c110', seriesId: nemo.id, chapter: 110 })
    const chapters = seriesInnerChapters([volume], { v13: found }, [file])
    expect(chapters.map((c) => c.chapter)).toEqual([109, 111])
  })
})
