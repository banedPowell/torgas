import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'
import WorkSeriesChapters from '~/components/work/WorkSeriesChapters.vue'
import type { Work } from '~/types/core'
import { buildSeriesChapterRows, chapterGaps, countMissing } from '~/utils/seriesChapters'
import { makeWork, nemo } from '../fixtures'

function chapters(count: number): Work[] {
  return Array.from({ length: count }, (_, i) =>
    makeWork({
      id: `c${i + 1}`,
      title: `Nemo c${i + 1}`,
      format: 'cbz',
      seriesId: nemo.id,
      chapter: i + 1,
      volume: Math.floor(i / 10) + 1,
      status: i < 1500 ? 'finished' : 'to_read',
      progress: i < 1500 ? 1 : 0,
    }),
  )
}

async function mount(works: Work[], query = '') {
  const rows = buildSeriesChapterRows(works, query)
  const gaps = chapterGaps(works)
  return mountSuspended(WorkSeriesChapters, {
    props: {
      rows,
      shown: rows.filter((r) => r.kind === 'chapter').length,
      total: works.length,
      nextId: 'c1501',
      gaps,
      missingCount: countMissing(gaps),
      query,
    },
  })
}

describe('WorkSeriesChapters', () => {
  it('affiche une petite liste en entier, intitulés de volume compris', async () => {
    const wrapper = await mount(chapters(12))
    expect(wrapper.findAll('li')).toHaveLength(14)
    expect(wrapper.text()).toContain('Volume 2')
    expect(wrapper.text()).toContain('Chapitre 12')
  })

  it('ne rend qu’une fenêtre d’une liste de 3000 chapitres', async () => {
    const wrapper = await mount(chapters(3000))
    const items = wrapper.findAll('li')
    expect(items.length).toBeGreaterThan(0)
    expect(items.length).toBeLessThan(100)
  })

  it('signale l’absence de résultat', async () => {
    const wrapper = await mount(chapters(12), '99')
    expect(wrapper.find('ol').exists()).toBe(false)
    expect(wrapper.text()).toContain('Aucun chapitre ne correspond à « 99 »')
  })

  it('résume les chapitres manquants', async () => {
    const works = chapters(10).filter((w) => ![3, 4, 7].includes(w.chapter!))
    const wrapper = await mount(works)
    expect(wrapper.text()).toContain('3 chapitres manquants : 3 à 4 et 7')
  })
})
