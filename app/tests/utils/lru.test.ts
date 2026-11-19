import { describe, expect, it } from 'vitest'
import { LruCache } from '~/utils/lru'

function cache(capacity = 2) {
  const evicted: string[] = []
  const lru = new LruCache<string, string>(capacity, (value, key) =>
    evicted.push(`${key}=${value}`),
  )
  return { lru, evicted }
}

describe('LruCache', () => {
  it('évince l’entrée la moins récemment utilisée', () => {
    const { lru, evicted } = cache()
    lru.set('a', '1')
    lru.set('b', '2')
    expect(lru.get('a')).toBe('1') // « a » redevient récent
    lru.set('c', '3')
    expect(evicted).toEqual(['b=2'])
    expect(lru.has('b')).toBe(false)
    expect(lru.size).toBe(2)
  })

  it('libère l’ancienne valeur quand on remplace une clé', () => {
    const { lru, evicted } = cache()
    lru.set('a', '1')
    lru.set('a', '1')
    expect(evicted).toEqual([])
    lru.set('a', '2')
    expect(evicted).toEqual(['a=1'])
    expect(lru.get('a')).toBe('2')
  })

  it('libère à la suppression et au vidage', () => {
    const { lru, evicted } = cache(3)
    lru.set('a', '1')
    lru.set('b', '2')
    lru.set('c', '3')
    expect(lru.delete('b')).toBe(true)
    expect(lru.delete('b')).toBe(false)
    lru.clear()
    expect(evicted).toEqual(['b=2', 'a=1', 'c=3'])
    expect(lru.size).toBe(0)
    expect(lru.get('a')).toBeUndefined()
  })

  it('refuse une capacité invalide', () => {
    expect(() => new LruCache(0)).toThrow(RangeError)
    expect(() => new LruCache(1.5)).toThrow(RangeError)
  })
})
