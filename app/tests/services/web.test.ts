import { describe, expect, it } from 'vitest'
import { checkFraction, workFromRow } from '~/services/core/web/sql'
import { importErrorStatus } from '~/services/core/web/wasm'

describe('WebBridge : utilitaires', () => {
  it('classe les erreurs d’analyse du cœur', () => {
    expect(importErrorStatus('format non pris en charge : archive ZIP sans EPUB ni images')).toBe(
      'unsupported',
    )
    expect(importErrorStatus('archive ZIP illisible : invalid Zip archive')).toBe('unsupported')
    expect(importErrorStatus('EPUB invalide : OPF introuvable')).toBe('error')
  })

  it('convertit une ligne SQL en œuvre', () => {
    const work = workFromRow({
      id: 'w',
      title: 'Saga',
      authors: '["A","B"]',
      kind: 'comic',
      language: null,
      cover_url: 'covers/abc.jpg',
      series_id: 's',
      volume: 3,
      format: 'cbz',
      sha256: 'abc',
      size_bytes: 10n,
      page_count: 12,
      added_at: '2026-01-01T00:00:00.000Z',
      status: 'to_read',
      progress: 0,
      last_read_at: null,
    })
    expect(work).toMatchObject({
      authors: ['A', 'B'],
      coverPath: 'covers/abc.jpg',
      sizeBytes: 10,
      volume: 3,
      pageCount: 12,
      language: undefined,
      lastReadAt: undefined,
    })
  })

  it('valide les progressions', () => {
    expect(() => checkFraction('progression', 0.5)).not.toThrow()
    expect(() => checkFraction('progression', 1.5)).toThrow('hors de [0, 1]')
    expect(() => checkFraction('progression', Number.NaN)).toThrow()
  })
})
