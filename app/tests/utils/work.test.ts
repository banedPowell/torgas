import { describe, expect, it } from 'vitest'
import type { Series, Work } from '~/types/core'
import { formatBytes, formatDate, formatLanguage } from '~/utils/format'
import {
  buildVolumeRows,
  deriveSeriesStatus,
  describeTarget,
  formatVolumeNumbers,
  missingVolumes,
  nextVolume,
  readAction,
  resolveTarget,
  sortVolumes,
  summarizeSeries,
} from '~/utils/work'
import { makeWork, nemo, sampleSeries, sampleWorks } from '../fixtures'

const volume = (n: number, extra: Partial<Work> = {}) =>
  makeWork({ id: `v${n}`, title: `Série ${n}`, seriesId: nemo.id, volume: n, ...extra })

describe('missingVolumes', () => {
  it('liste les numéros absents entre 1 et le dernier volume', () => {
    expect(missingVolumes([volume(1), volume(2), volume(3)])).toEqual([])
    expect(
      missingVolumes([volume(1), volume(2), volume(3), volume(5), volume(6), volume(8)]),
    ).toEqual([4, 7])
  })

  it('compte les volumes avant le premier présent comme manquants', () => {
    expect(missingVolumes([volume(3), volume(4)])).toEqual([1, 2])
  })

  it('ignore les volumes sans numéro et les doublons', () => {
    expect(missingVolumes([])).toEqual([])
    expect(missingVolumes([makeWork({ id: 'x', title: 'Hors-série' })])).toEqual([])
    expect(missingVolumes([volume(1), volume(1, { id: 'bis' }), volume(2)])).toEqual([])
  })
})

describe('nextVolume', () => {
  it('renvoie le premier volume non terminé, dans l’ordre des numéros', () => {
    const volumes = [
      volume(3, { status: 'reading', progress: 0.4 }),
      volume(1, { status: 'finished', progress: 1 }),
      volume(2, { status: 'to_read' }),
    ]
    expect(nextVolume(volumes)?.id).toBe('v2')
  })

  it('renvoie undefined quand tout est terminé', () => {
    expect(nextVolume([volume(1, { status: 'finished', progress: 1 })])).toBeUndefined()
    expect(nextVolume([])).toBeUndefined()
  })

  it('ne tient pas compte du tri d’entrée', () => {
    expect(nextVolume([volume(10), volume(2)])?.id).toBe('v2')
  })
})

describe('sortVolumes', () => {
  it('trie par numéro puis par titre, les volumes sans numéro à la fin', () => {
    const sorted = sortVolumes([
      volume(10),
      makeWork({ id: 'b', title: 'Bonus' }),
      volume(2),
      makeWork({ id: 'a', title: 'Annexe' }),
    ])
    expect(sorted.map((w) => w.id)).toEqual(['v2', 'v10', 'a', 'b'])
  })
})

describe('buildVolumeRows', () => {
  it('insère une ligne par trou, regroupant les volumes consécutifs manquants', () => {
    const rows = buildVolumeRows([volume(1), volume(4), volume(5), volume(8)])
    expect(
      rows.map((r) => (r.kind === 'gap' ? `gap:${r.numbers.join(',')}` : `v${r.number}`)),
    ).toEqual(['v1', 'gap:2,3', 'v4', 'v5', 'gap:6,7', 'v8'])
  })

  it('ne crée aucun trou pour une série complète', () => {
    expect(buildVolumeRows([volume(1), volume(2)]).every((r) => r.kind === 'volume')).toBe(true)
  })
})

describe('formatVolumeNumbers', () => {
  it('joint les numéros et abrège les suites de trois ou plus', () => {
    expect(formatVolumeNumbers([6])).toBe('6')
    expect(formatVolumeNumbers([4, 7])).toBe('4 et 7')
    expect(formatVolumeNumbers([3, 4])).toBe('3 et 4')
    expect(formatVolumeNumbers([3, 4, 5, 6, 7, 8, 9])).toBe('3 à 9')
    expect(formatVolumeNumbers([1, 3, 4, 5, 8])).toBe('1, 3 à 5 et 8')
  })
})

describe('summarizeSeries et deriveSeriesStatus', () => {
  const finished = volume(1, { status: 'finished', progress: 1 })
  const reading = volume(2, { status: 'reading', progress: 0.5 })
  const fresh = volume(3)

  it('calcule terminés, total et progression moyenne', () => {
    expect(summarizeSeries([finished, reading, fresh])).toEqual({
      total: 3,
      finished: 1,
      progress: 0.5,
    })
    expect(summarizeSeries([])).toEqual({ total: 0, finished: 0, progress: 0 })
  })

  it('déduit le statut de la série', () => {
    expect(deriveSeriesStatus([])).toBe('to_read')
    expect(deriveSeriesStatus([fresh, volume(4)])).toBe('to_read')
    expect(deriveSeriesStatus([finished, volume(5, { status: 'finished' })])).toBe('finished')
    expect(deriveSeriesStatus([finished, fresh])).toBe('reading')
    expect(deriveSeriesStatus([fresh, reading])).toBe('reading')
    expect(deriveSeriesStatus([volume(6, { status: 'abandoned' })])).toBe('abandoned')
  })
})

describe('readAction', () => {
  it('propose lire, reprendre ou relire', () => {
    expect(readAction({ status: 'to_read', progress: 0 })).toEqual({ kind: 'read', percent: 0 })
    expect(readAction({ status: 'reading', progress: 0.424 })).toEqual({
      kind: 'resume',
      percent: 42,
    })
    expect(readAction({ status: 'finished', progress: 1 })).toEqual({
      kind: 'reread',
      percent: 100,
    })
    expect(readAction({ status: 'reading', progress: 1 }).kind).toBe('reread')
    expect(readAction({ status: 'finished', progress: 0.3 }).kind).toBe('reread')
  })
})

describe('resolveTarget', () => {
  it('résout une œuvre seule', () => {
    const target = resolveTarget('bovary', sampleWorks, sampleSeries)
    expect(target).toMatchObject({ kind: 'work', work: { id: 'bovary' } })
  })

  it('résout une série par son identifiant, volumes triés', () => {
    const target = resolveTarget(nemo.id, sampleWorks, sampleSeries)
    expect(target?.kind).toBe('series')
    if (target?.kind === 'series')
      expect(target.volumes.map((v) => v.id)).toEqual(['nemo-2', 'nemo-10'])
  })

  it('ouvre la série à partir de l’identifiant d’un de ses volumes (lien de la bibliothèque)', () => {
    expect(resolveTarget('nemo-2', sampleWorks, sampleSeries)?.kind).toBe('series')
  })

  it('garde l’œuvre seule si sa série est inconnue, et renvoie null si rien ne correspond', () => {
    const orphan = makeWork({ id: 'orphelin', title: 'Orphelin', seriesId: 'inconnue' })
    expect(resolveTarget('orphelin', [orphan], [])?.kind).toBe('work')
    expect(resolveTarget('absent', sampleWorks, sampleSeries)).toBeNull()
    const empty: Series = { id: 'vide', title: 'Vide', direction: 'ltr' }
    expect(resolveTarget('vide', sampleWorks, [empty])).toBeNull()
  })
})

describe('describeTarget', () => {
  it('décrit une œuvre seule', () => {
    const meta = describeTarget({ kind: 'work', work: sampleWorks[0]! })
    expect(meta).toMatchObject({ title: 'Madame Bovary', isSeries: false, volumeCount: 1 })
  })

  it('agrège une série : taille totale, première date d’ajout, couverture', () => {
    const volumes = [
      volume(1, { sizeBytes: 100, addedAt: '2026-02-01T00:00:00.000Z', authors: ['McCay'] }),
      volume(2, {
        sizeBytes: 250,
        addedAt: '2026-01-01T00:00:00.000Z',
        authors: ['McCay'],
        coverUrl: 'blob:cover',
        language: 'en',
      }),
    ]
    const meta = describeTarget({ kind: 'series', series: nemo, volumes })
    expect(meta).toMatchObject({
      title: 'Little Nemo',
      authors: ['McCay'],
      coverUrl: 'blob:cover',
      language: 'en',
      sizeBytes: 350,
      addedAt: '2026-01-01T00:00:00.000Z',
      isSeries: true,
      volumeCount: 2,
    })
  })
})

describe('formats de la fiche', () => {
  it('affiche la taille en octets français', () => {
    expect(formatBytes(512)).toBe('512 o')
    expect(formatBytes(182_000_000).replace(/\s/g, ' ')).toBe('182 Mo')
    expect(formatBytes(1_400_000_000).replace(/\s/g, ' ')).toBe('1,4 Go')
  })

  it('affiche la date et la langue en français', () => {
    expect(formatDate('2026-03-12T12:00:00.000Z')).toContain('mars 2026')
    expect(formatDate('pas une date')).toBe('')
    expect(formatLanguage('fr')).toBe('français')
    expect(formatLanguage('en')).toBe('anglais')
  })
})
