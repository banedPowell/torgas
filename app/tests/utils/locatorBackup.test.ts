import { beforeEach, describe, expect, it } from 'vitest'
import type { Locator } from '~/types/core'
import {
  clearLocatorBackup,
  LOCATOR_BACKUP_PREFIX,
  readLocatorBackup,
  reconcileLocator,
  sameLocator,
  writeLocatorBackup,
} from '~/utils/locatorBackup'

const page = (n: number, progress = n / 6): Locator => ({ format: 'cbz', page: n, progress })
const T0 = new Date('2026-11-19T10:00:00.000Z')
const T1 = new Date('2026-11-19T10:00:05.000Z')

describe('copie locale de la position', () => {
  beforeEach(() => localStorage.clear())

  it('écrit, relit et retire la dernière position d’une œuvre', () => {
    writeLocatorBackup('w1', page(3), T0)
    expect(readLocatorBackup('w1')).toEqual({ locator: page(3), savedAt: T0.toISOString() })
    expect(readLocatorBackup('w2')).toBeNull()
    clearLocatorBackup('w1')
    expect(readLocatorBackup('w1')).toBeNull()
  })

  it('ne retire pas une copie remplacée par une position plus récente', () => {
    writeLocatorBackup('w1', page(4))
    clearLocatorBackup('w1', page(3))
    expect(readLocatorBackup('w1')?.locator).toEqual(page(4))
    clearLocatorBackup('w1', page(4))
    expect(readLocatorBackup('w1')).toBeNull()
  })

  it('ignore une copie illisible ou invalide', () => {
    localStorage.setItem(`${LOCATOR_BACKUP_PREFIX}a`, '{oups')
    localStorage.setItem(
      `${LOCATOR_BACKUP_PREFIX}b`,
      JSON.stringify({ locator: { format: 'cbz', progress: 2 }, savedAt: T0.toISOString() }),
    )
    localStorage.setItem(
      `${LOCATOR_BACKUP_PREFIX}c`,
      JSON.stringify({ locator: page(1), savedAt: 'hier' }),
    )
    expect(readLocatorBackup('a')).toBeNull()
    expect(readLocatorBackup('b')).toBeNull()
    expect(readLocatorBackup('c')).toBeNull()
  })

  it('compare deux positions', () => {
    expect(sameLocator(page(2), page(2))).toBe(true)
    expect(sameLocator(page(2), page(3))).toBe(false)
    expect(sameLocator(page(5, 0.9), page(5, 1))).toBe(false)
    expect(sameLocator(null, null)).toBe(true)
    expect(sameLocator(page(1), null)).toBe(false)
  })
})

describe('reconcileLocator', () => {
  const backup = (locator: Locator, at: Date) => ({ locator, savedAt: at.toISOString() })

  it('garde la position du cœur sans copie locale', () => {
    expect(reconcileLocator(page(2), null, T0.toISOString())).toEqual({
      locator: page(2),
      push: false,
    })
  })

  it('reprend une copie plus récente que la dernière lecture et la pousse', () => {
    expect(reconcileLocator(page(1), backup(page(3), T1), T0.toISOString())).toEqual({
      locator: page(3),
      push: true,
    })
  })

  it('reprend la copie quand le cœur n’a aucune position', () => {
    expect(reconcileLocator(null, backup(page(3), T0))).toEqual({ locator: page(3), push: true })
  })

  it('ignore une copie plus ancienne que la dernière lecture enregistrée', () => {
    expect(reconcileLocator(page(4), backup(page(3), T0), T1.toISOString())).toEqual({
      locator: page(4),
      push: false,
    })
  })

  it('ne repousse pas une copie identique à la position du cœur', () => {
    expect(reconcileLocator(page(3), backup(page(3), T1), T0.toISOString())).toEqual({
      locator: page(3),
      push: false,
    })
  })
})
