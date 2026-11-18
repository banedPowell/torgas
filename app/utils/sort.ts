const collator = new Intl.Collator('fr', { numeric: true, sensitivity: 'base' })

/** Tri « naturel » : « Tome 2 » avant « Tome 10 », sans tenir compte de la casse ni des accents. */
export function naturalCompare(a: string, b: string): number {
  return collator.compare(a, b)
}

/** Compare deux dates ISO, la plus récente d'abord ; les dates absentes vont à la fin. */
export function compareRecentFirst(a?: string, b?: string): number {
  if (a === b) return 0
  if (!a) return 1
  if (!b) return -1
  return b.localeCompare(a)
}
