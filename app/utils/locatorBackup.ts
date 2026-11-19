import type { Locator } from '~/types/core'

/** Préfixe des clés `localStorage` : une copie de la dernière position par œuvre. */
export const LOCATOR_BACKUP_PREFIX = 'torgas:locator:'

/** Dernière position connue d'une œuvre, pas encore confirmée par le cœur. */
export interface LocatorBackup {
  locator: Locator
  /** Moment du changement de page (ISO 8601). */
  savedAt: string
}

function key(workId: string): string {
  return LOCATOR_BACKUP_PREFIX + workId
}

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null // stockage bloqué (réglages du navigateur)
  }
}

/** Deux positions identiques (même format, même endroit, même progression). */
export function sameLocator(a: Locator | null | undefined, b: Locator | null | undefined): boolean {
  if (!a || !b) return a === b
  return (
    a.format === b.format &&
    (a.cfi ?? null) === (b.cfi ?? null) &&
    (a.page ?? null) === (b.page ?? null) &&
    a.progress === b.progress
  )
}

function isLocator(value: unknown): value is Locator {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  return (
    (v.format === 'epub' || v.format === 'cbz') &&
    typeof v.progress === 'number' &&
    Number.isFinite(v.progress) &&
    v.progress >= 0 &&
    v.progress <= 1 &&
    (v.cfi === undefined || typeof v.cfi === 'string') &&
    (v.page === undefined || (Number.isInteger(v.page) && (v.page as number) >= 0))
  )
}

/**
 * Copie synchrone de la position, écrite à chaque changement de page : elle survit à un
 * déchargement de la page qui interromprait l'écriture asynchrone dans le cœur (#30).
 */
export function writeLocatorBackup(workId: string, locator: Locator, at = new Date()): void {
  const backup: LocatorBackup = { locator: { ...locator }, savedAt: at.toISOString() }
  try {
    storage()?.setItem(key(workId), JSON.stringify(backup))
  } catch {
    // Quota dépassé ou stockage refusé : la sauvegarde dans le cœur reste la référence.
  }
}

export function readLocatorBackup(workId: string): LocatorBackup | null {
  try {
    const raw = storage()?.getItem(key(workId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<LocatorBackup>
    if (!isLocator(parsed.locator) || Number.isNaN(Date.parse(String(parsed.savedAt)))) {
      return null
    }
    return { locator: parsed.locator, savedAt: String(parsed.savedAt) }
  } catch {
    return null
  }
}

/** Retire la copie ; avec `locator`, seulement si elle n'a pas été remplacée depuis. */
export function clearLocatorBackup(workId: string, locator?: Locator): void {
  try {
    if (locator && !sameLocator(readLocatorBackup(workId)?.locator, locator)) return
    storage()?.removeItem(key(workId))
  } catch {
    // Rien à faire : la copie sera ignorée ou remplacée plus tard.
  }
}

/**
 * Position à reprendre : la copie locale si le cœur ne l'a pas encore (plus récente que la
 * dernière lecture enregistrée et différente de la position stockée), sinon celle du cœur.
 * Renvoie aussi si la copie doit être poussée dans le cœur.
 */
export function reconcileLocator(
  stored: Locator | null,
  backup: LocatorBackup | null,
  lastReadAt?: string,
): { locator: Locator | null; push: boolean } {
  if (!backup || sameLocator(backup.locator, stored)) return { locator: stored, push: false }
  const read = lastReadAt ? Date.parse(lastReadAt) : Number.NaN
  const newer = !stored || Number.isNaN(read) || Date.parse(backup.savedAt) > read
  return newer ? { locator: backup.locator, push: true } : { locator: stored, push: false }
}
