const percentFormat = new Intl.NumberFormat('fr-FR', { style: 'percent', maximumFractionDigits: 0 })

/** Ramène une valeur dans l'intervalle 0..1 (NaN donne 0). */
export function clampProgress(value: number): number {
  if (Number.isNaN(value)) return 0
  return Math.min(1, Math.max(0, value))
}

/** Progression 0..1 affichée en pourcentage français (« 9 % »). */
export function formatPercent(progress: number): string {
  return percentFormat.format(clampProgress(progress))
}

const authorsFormat = new Intl.ListFormat('fr', { style: 'long', type: 'conjunction' })

/** Liste d'auteurs lisible : « Flaubert », « Erckmann et Chatrian », « A, B et C ». */
export function formatAuthors(authors: readonly string[]): string {
  return authorsFormat.format(authors.map((a) => a.trim()).filter(Boolean))
}
