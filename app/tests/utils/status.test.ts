import { describe, expect, it } from 'vitest'
import { FINISHED_THRESHOLD, statusAfterProgress } from '~/services/core/status'
import { MemoryBridge } from '~/services/core/memory'

describe('statusAfterProgress', () => {
  it('passe « à lire » en « en cours » à la première progression', () => {
    expect(statusAfterProgress('to_read', 0)).toBe('to_read')
    expect(statusAfterProgress('to_read', 0.01)).toBe('reading')
    expect(statusAfterProgress('reading', 0.5)).toBe('reading')
  })

  it('passe « terminée » à 100 % ou dès 0,995', () => {
    expect(statusAfterProgress('reading', 1)).toBe('finished')
    expect(statusAfterProgress('to_read', FINISHED_THRESHOLD)).toBe('finished')
    expect(statusAfterProgress('reading', 0.994)).toBe('reading')
  })

  it('garde « terminée » en cas de relecture', () => {
    expect(statusAfterProgress('finished', 0.1)).toBe('finished')
    expect(statusAfterProgress('finished', 0)).toBe('finished')
  })

  it('reprend une œuvre en pause ou abandonnée (comme le cœur Rust)', () => {
    expect(statusAfterProgress('paused', 0.3)).toBe('reading')
    expect(statusAfterProgress('abandoned', 0.3)).toBe('reading')
    expect(statusAfterProgress('paused', 0)).toBe('paused')
  })
})

describe('MemoryBridge.saveLocator', () => {
  it('met à jour le statut automatiquement', async () => {
    const core = new MemoryBridge()
    const { work } = await core.importFile('Le Horla.epub', new TextEncoder().encode('epub'))
    const id = work!.id
    const locator = (progress: number) => ({ format: 'epub' as const, cfi: 'c', progress })

    expect((await core.getWork(id))?.status).toBe('to_read')
    await core.saveLocator(id, locator(0))
    expect((await core.getWork(id))?.status).toBe('to_read')
    await core.saveLocator(id, locator(0.2))
    expect((await core.getWork(id))?.status).toBe('reading')
    await core.saveLocator(id, locator(0.997))
    expect((await core.getWork(id))?.status).toBe('finished')
    await core.saveLocator(id, locator(0.1))
    expect((await core.getWork(id))?.status).toBe('finished')
  })
})
