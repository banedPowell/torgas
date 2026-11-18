import type { Series, Work } from '~/types/core'

export function makeWork(overrides: Partial<Work> & Pick<Work, 'id' | 'title'>): Work {
  return {
    authors: [],
    kind: 'novel',
    format: 'epub',
    sha256: overrides.id.padEnd(64, '0'),
    sizeBytes: 1000,
    addedAt: '2026-01-01T00:00:00.000Z',
    status: 'to_read',
    progress: 0,
    ...overrides,
  }
}

export const nemo: Series = { id: 's-nemo', title: 'Little Nemo', direction: 'ltr' }

export const sampleSeries: Series[] = [nemo]

export const sampleWorks: Work[] = [
  makeWork({
    id: 'bovary',
    title: 'Madame Bovary',
    authors: ['Gustave Flaubert'],
    addedAt: '2026-01-02T00:00:00.000Z',
    status: 'reading',
    progress: 0.09,
    lastReadAt: '2026-03-10T08:00:00.000Z',
  }),
  makeWork({
    id: 'horla',
    title: 'Le Horla',
    authors: ['Guy de Maupassant'],
    addedAt: '2026-01-05T00:00:00.000Z',
    status: 'finished',
    progress: 1,
    lastReadAt: '2026-03-12T08:00:00.000Z',
  }),
  makeWork({
    id: 'eleves',
    title: 'Les Misérables',
    authors: ['Victor Hugo'],
    addedAt: '2026-01-03T00:00:00.000Z',
  }),
  makeWork({
    id: 'nemo-10',
    title: 'Little Nemo 10',
    kind: 'comic',
    format: 'cbz',
    seriesId: nemo.id,
    volume: 10,
    addedAt: '2026-02-01T00:00:00.000Z',
  }),
  makeWork({
    id: 'nemo-2',
    title: 'Little Nemo 2',
    kind: 'comic',
    format: 'cbz',
    seriesId: nemo.id,
    volume: 2,
    status: 'finished',
    progress: 1,
    addedAt: '2026-01-20T00:00:00.000Z',
    lastReadAt: '2026-03-01T00:00:00.000Z',
  }),
]
