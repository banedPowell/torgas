import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Work } from '~/types/core'

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }))

vi.mock('@tauri-apps/api/core', () => ({
  invoke,
  // Forme macOS/Linux de `convertFileSrc` (Windows : http://torgas.localhost/…).
  convertFileSrc: (path: string, protocol: string) =>
    `${protocol}://localhost/${encodeURIComponent(path)}`,
}))

const { TauriBridge, TauriCoreError, readOpenedFile } = await import('~/services/core/tauri')

const SHA = 'a'.repeat(64)

function work(patch: Partial<Work> = {}): Work {
  return {
    id: 'w1',
    title: 'Titre',
    authors: [],
    kind: 'comic',
    format: 'cbz',
    sha256: SHA,
    sizeBytes: 3,
    addedAt: '2026-11-19T00:00:00Z',
    status: 'to_read',
    progress: 0,
    ...patch,
  }
}

describe('TauriBridge', () => {
  beforeEach(() => {
    invoke.mockReset()
  })

  it('envoie les octets en binaire brut avec le nom en en-tête', async () => {
    invoke.mockResolvedValue({ status: 'imported', work: work() })
    const bytes = new Uint8Array([1, 2, 3])
    const result = await new TauriBridge().importFile("L'été v01.cbz", bytes)
    expect(invoke).toHaveBeenCalledWith('import_file', bytes, {
      headers: { 'X-Torgas-Name': "L'%C3%A9t%C3%A9%20v01.cbz" },
    })
    expect(result.status).toBe('imported')
  })

  it('convertit les couvertures et les pages en URL torgas://', async () => {
    invoke.mockResolvedValue([work({ coverUrl: `torgas://cover/${SHA}` }), work({ id: 'w2' })])
    const bridge = new TauriBridge()
    const [withCover, without] = await bridge.listWorks()
    expect(withCover!.coverUrl).toBe(`torgas://localhost/cover%2F${SHA}`)
    expect(without!.coverUrl).toBeUndefined()
    expect(await bridge.getPageUrl('w1', 4)).toBe('torgas://localhost/page%2Fw1%2F4')
  })

  it('passe les arguments en camelCase et lit les réponses binaires', async () => {
    const bridge = new TauriBridge()
    invoke.mockResolvedValue(undefined)
    await bridge.setSeriesDirection('s1', 'rtl')
    expect(invoke).toHaveBeenLastCalledWith(
      'set_series_direction',
      { seriesId: 's1', direction: 'rtl' },
      undefined,
    )
    await bridge.endSession('x', 3, 0.5)
    expect(invoke).toHaveBeenLastCalledWith(
      'end_session',
      { sessionId: 'x', minutes: 3, progress: 0.5 },
      undefined,
    )
    invoke.mockResolvedValue(new Uint8Array([9, 8]).buffer)
    expect(await bridge.getBookBytes('w1')).toEqual(new Uint8Array([9, 8]))
  })

  it('transforme les erreurs Rust en Error avec code', async () => {
    invoke.mockRejectedValue({ code: 'not_found', message: 'œuvre introuvable : w9' })
    const error = await new TauriBridge().getLocator('w9').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(TauriCoreError)
    expect(error).toMatchObject({ code: 'not_found', message: 'œuvre introuvable : w9' })
  })

  it('lit un fichier ouvert en File', async () => {
    invoke.mockResolvedValue(new Uint8Array([1, 2]).buffer)
    const file = await readOpenedFile({ path: '/tmp/a.cbz', name: 'a.cbz', sizeBytes: 2 })
    expect(invoke).toHaveBeenCalledWith('read_opened_file', { path: '/tmp/a.cbz' }, undefined)
    expect(file.name).toBe('a.cbz')
    expect(file.size).toBe(2)
  })
})
