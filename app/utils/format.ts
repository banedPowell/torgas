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

const sizeFormat = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 })
const SIZE_UNITS = ['o', 'Ko', 'Mo', 'Go']

/** Taille de fichier en unités françaises (octets) : « 182 Mo », « 1,4 Go ». */
export function formatBytes(bytes: number): string {
  let value = Math.max(0, bytes)
  let unit = 0
  while (value >= 1000 && unit < SIZE_UNITS.length - 1) {
    value /= 1000
    unit++
  }
  return `${sizeFormat.format(unit === 0 ? Math.round(value) : value)} ${SIZE_UNITS[unit]}`
}

const dateFormat = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})

/** Date ISO en date longue française (« 12 mars 2026 ») ; chaîne vide si invalide. */
export function formatDate(iso: string): string {
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? '' : dateFormat.format(date)
}

const languageNames = new Intl.DisplayNames('fr', { type: 'language' })

/** Code de langue BCP 47 en nom français (« fr » donne « français ») ; le code brut si inconnu. */
export function formatLanguage(code: string): string {
  try {
    return languageNames.of(code) ?? code
  } catch {
    return code
  }
}

const authorsFormat = new Intl.ListFormat('fr', { style: 'long', type: 'conjunction' })

/** Liste d'auteurs lisible : « Flaubert », « Erckmann et Chatrian », « A, B et C ». */
export function formatAuthors(authors: readonly string[]): string {
  return authorsFormat.format(authors.map((a) => a.trim()).filter(Boolean))
}
