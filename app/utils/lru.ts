/**
 * Cache LRU (moins récemment utilisé) de taille fixe. `onEvict` libère les ressources des
 * entrées évincées ou supprimées (blob URL révoquée, archive wasm libérée…).
 */
export class LruCache<K, V> {
  private readonly entries = new Map<K, V>()

  constructor(
    readonly capacity: number,
    private readonly onEvict?: (value: V, key: K) => void,
  ) {
    if (!Number.isInteger(capacity) || capacity < 1) {
      throw new RangeError(`Capacité invalide : ${capacity}`)
    }
  }

  get size(): number {
    return this.entries.size
  }

  has(key: K): boolean {
    return this.entries.has(key)
  }

  /** Lit une entrée et la marque comme la plus récente. */
  get(key: K): V | undefined {
    if (!this.entries.has(key)) return undefined
    const value = this.entries.get(key) as V
    this.entries.delete(key)
    this.entries.set(key, value)
    return value
  }

  /** Ajoute ou remplace une entrée ; l'ancienne valeur et la plus ancienne en trop sont évincées. */
  set(key: K, value: V): void {
    if (this.entries.has(key)) {
      const previous = this.entries.get(key) as V
      this.entries.delete(key)
      if (previous !== value) this.onEvict?.(previous, key)
    }
    this.entries.set(key, value)
    while (this.entries.size > this.capacity) {
      const [oldestKey, oldest] = this.entries.entries().next().value as [K, V]
      this.entries.delete(oldestKey)
      this.onEvict?.(oldest, oldestKey)
    }
  }

  delete(key: K): boolean {
    if (!this.entries.has(key)) return false
    const value = this.entries.get(key) as V
    this.entries.delete(key)
    this.onEvict?.(value, key)
    return true
  }

  clear(): void {
    const all = [...this.entries]
    this.entries.clear()
    for (const [key, value] of all) this.onEvict?.(value, key)
  }
}
