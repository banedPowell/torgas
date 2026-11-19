import type { Series, Work } from '~/types/core'
import { makeWork } from './fixtures'

/** Page générée en SVG (data URL) : aucune image sous droits dans les tests. */
export function svgPage(n: number, width = 600, height = 900): string {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">` +
    `<rect width="100%" height="100%" fill="#eee"/>` +
    `<text x="50%" y="50%" font-size="120" text-anchor="middle">${n}</text></svg>`
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

export function svgPages(count: number): string[] {
  return Array.from({ length: count }, (_, i) => svgPage(i + 1))
}

export const testSeries: Series = { id: 's-test', title: 'Série test', direction: 'rtl' }

export function comicWork(overrides: Partial<Work> & Pick<Work, 'id'>): Work {
  return makeWork({
    title: `Volume ${overrides.volume ?? ''}`.trim(),
    kind: 'comic',
    format: 'cbz',
    pageCount: 6,
    ...overrides,
  })
}

export const volume1 = comicWork({ id: 'vol-1', seriesId: testSeries.id, volume: 1 })
export const volume2 = comicWork({ id: 'vol-2', seriesId: testSeries.id, volume: 2, pageCount: 4 })
export const oneShot = comicWork({ id: 'one-shot', title: 'One shot', pageCount: 5 })
