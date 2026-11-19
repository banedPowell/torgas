import { describe, expect, it } from 'vitest'
import type { LibraryFilters } from '~/types/library'
import {
  buildLibrary,
  countByStatus,
  entryTitle,
  groupBySeries,
  matchesFilters,
  pickResume,
  seriesCounts,
  summarizeEntry,
  visibleResume,
} from '~/utils/library'
import { makeWork, nemo, sampleSeries, sampleWorks } from '../fixtures'

const noFilter: LibraryFilters = { query: '', format: 'all', status: 'all' }

describe('library utils', () => {
  it('filtre par recherche sans accents, sur titre, auteur et série', () => {
    const [bovary] = sampleWorks
    expect(matchesFilters(bovary!, { ...noFilter, query: 'flaub' })).toBe(true)
    expect(matchesFilters(bovary!, { ...noFilter, query: 'BOVARY' })).toBe(true)
    expect(matchesFilters(sampleWorks[2]!, { ...noFilter, query: 'miserables' })).toBe(true)
    expect(matchesFilters(sampleWorks[3]!, { ...noFilter, query: 'nemo' }, nemo.title)).toBe(true)
    expect(matchesFilters(bovary!, { ...noFilter, query: 'verne' })).toBe(false)
  })

  it('filtre par format et statut', () => {
    expect(matchesFilters(sampleWorks[3]!, { ...noFilter, format: 'epub' })).toBe(false)
    expect(matchesFilters(sampleWorks[0]!, { ...noFilter, status: 'reading' })).toBe(true)
    expect(matchesFilters(sampleWorks[0]!, { ...noFilter, status: 'finished' })).toBe(false)
  })

  it('regroupe les volumes d’une série, triés par numéro', () => {
    const entries = groupBySeries(sampleWorks, sampleSeries)
    expect(entries).toHaveLength(4)
    const series = entries.find((e) => e.kind === 'series')
    expect(series?.kind === 'series' && series.works.map((w) => w.volume)).toEqual([2, 10])
    expect(series?.kind === 'series' && series.progress).toBe(0.5)
    expect(series?.kind === 'series' && series.finishedCount).toBe(1)
  })

  it('laisse seule une œuvre dont la série est inconnue', () => {
    const entries = groupBySeries(sampleWorks, [])
    expect(entries.every((e) => e.kind === 'work')).toBe(true)
  })

  it('trie par titre, ajout et dernière lecture', () => {
    const titles = (sort: 'title' | 'added' | 'lastRead') =>
      buildLibrary(sampleWorks, sampleSeries, noFilter, sort).map(entryTitle)
    expect(titles('title')).toEqual(['Le Horla', 'Les Misérables', 'Little Nemo', 'Madame Bovary'])
    expect(titles('added')).toEqual(['Little Nemo', 'Le Horla', 'Les Misérables', 'Madame Bovary'])
    expect(titles('lastRead')).toEqual([
      'Le Horla',
      'Madame Bovary',
      'Little Nemo',
      'Les Misérables',
    ])
  })

  it('compte les œuvres par statut', () => {
    expect(countByStatus(sampleWorks)).toEqual({
      all: 5,
      to_read: 2,
      reading: 1,
      finished: 2,
      abandoned: 0,
      paused: 0,
    })
  })

  it('propose la dernière lecture non terminée', () => {
    expect(pickResume(sampleWorks)?.id).toBe('bovary')
    expect(pickResume([])).toBeUndefined()
  })

  it('résume une série pour l’affichage', () => {
    const series = groupBySeries(sampleWorks, sampleSeries).find((e) => e.kind === 'series')!
    expect(summarizeEntry(series)).toMatchObject({
      title: 'Little Nemo',
      href: '/works/nemo-2',
      format: 'cbz',
      isSeries: true,
      volumesTotal: 2,
      volumesFinished: 1,
    })
    expect(seriesCounts(summarizeEntry(series))).toEqual([{ key: 'volumes', read: 1, total: 2 }])
  })

  it('compte chapitres et volumes d’une série', () => {
    const chapters = [1, 2, 3].map((n) =>
      makeWork({
        id: `ch-${n}`,
        title: `Nemo c${n}`,
        format: 'cbz',
        seriesId: nemo.id,
        chapter: n,
        status: n === 1 ? 'finished' : 'to_read',
      }),
    )
    const [entry] = groupBySeries([...sampleWorks, ...chapters], sampleSeries).filter(
      (e) => e.kind === 'series',
    )
    const summary = summarizeEntry(entry!)
    expect(summary).toMatchObject({ volumesTotal: 2, chaptersTotal: 3, chaptersFinished: 1 })
    expect(seriesCounts(summary)).toEqual([
      { key: 'volumes', read: 1, total: 2 },
      { key: 'chapters', read: 1, total: 3 },
    ])
    const onlyChapters = groupBySeries(chapters, sampleSeries)[0]!
    expect(onlyChapters.kind === 'series' && onlyChapters.works.map((w) => w.id)).toEqual([
      'ch-1',
      'ch-2',
      'ch-3',
    ])
    expect(seriesCounts(summarizeEntry(onlyChapters))).toEqual([
      { key: 'chapters', read: 1, total: 3 },
    ])
  })

  it("masque la reprise fermée tant qu'elle n'a pas été relue", () => {
    const [bovary, horla] = sampleWorks
    const dismissed = { id: bovary!.id, lastReadAt: bovary!.lastReadAt ?? null }
    expect(visibleResume(bovary, null)).toBe(bovary)
    expect(visibleResume(bovary, dismissed)).toBeUndefined()
    expect(visibleResume(horla, dismissed)).toBe(horla)
    const reread = { ...bovary!, lastReadAt: '2027-01-01T00:00:00.000Z' }
    expect(visibleResume(reread, dismissed)).toBe(reread)
    expect(visibleResume(undefined, dismissed)).toBeUndefined()
  })
})
