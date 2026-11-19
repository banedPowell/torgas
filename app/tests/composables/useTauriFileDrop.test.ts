import { describe, expect, it, vi } from 'vitest'

const { listen } = vi.hoisted(() => ({ listen: vi.fn() }))
vi.mock('@tauri-apps/api/event', () => ({ listen }))

describe('useTauriFileDrop', () => {
  it('ne fait rien hors de Tauri', () => {
    expect(isTauri()).toBe(false)
    const onFiles = vi.fn()
    const { hovering } = useTauriFileDrop(onFiles)
    expect(hovering.value).toBe(false)
    expect(listen).not.toHaveBeenCalled()
    expect(onFiles).not.toHaveBeenCalled()
  })
})
