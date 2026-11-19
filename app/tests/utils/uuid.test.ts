import { describe, expect, it } from 'vitest'
import { uuidv7 } from '~/utils/uuid'

const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

describe('uuidv7', () => {
  it('respecte le format RFC 9562 (version 7, variante 10xx)', () => {
    for (let i = 0; i < 50; i++) expect(uuidv7()).toMatch(UUID_V7)
  })

  it("encode l'horodatage en millisecondes sur les 48 premiers bits", () => {
    const zeros = (bytes: Uint8Array<ArrayBuffer>) => bytes.fill(0)
    expect(uuidv7(0, zeros)).toBe('00000000-0000-7000-8000-000000000000')
    // 2026-11-18T11:06:40.000Z = 1 795 000 000 000 ms = 0x01a1ee565e00
    expect(uuidv7(1_795_000_000_000, zeros)).toBe('01a1ee56-5e00-7000-8000-000000000000')
    const ones = (bytes: Uint8Array<ArrayBuffer>) => bytes.fill(0xff)
    expect(uuidv7(2 ** 48 - 1, ones)).toBe('ffffffff-ffff-7fff-bfff-ffffffffffff')
  })

  it('se trie dans l’ordre chronologique', () => {
    const ids = [3, 1_000, 1_700_000_000_000, 1_795_000_000_000].map((t) => uuidv7(t))
    expect([...ids].sort()).toEqual(ids)
  })

  it('reste unique à horodatage égal', () => {
    const ids = new Set(Array.from({ length: 1000 }, () => uuidv7(42)))
    expect(ids.size).toBe(1000)
  })
})
