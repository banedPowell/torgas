import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSessionTimer, IDLE_TIMEOUT_MS } from '~/utils/session'

const SECOND = 1000
const MINUTE = 60 * SECOND

describe('createSessionTimer', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T10:00:00Z'))
  })
  afterEach(() => vi.useRealTimers())

  function start() {
    return createSessionTimer(Date.now())
  }

  it('compte le temps tant que le lecteur interagit', () => {
    const timer = start()
    vi.advanceTimersByTime(MINUTE)
    timer.touch(Date.now())
    vi.advanceTimersByTime(90 * SECOND)
    expect(timer.activeMs(Date.now())).toBe(150 * SECOND)
    expect(timer.minutes(Date.now())).toBe(3)
    expect(timer.isRunning(Date.now())).toBe(true)
  })

  it('se met en pause après 2 min sans interaction', () => {
    const timer = start()
    vi.advanceTimersByTime(10 * MINUTE)
    expect(timer.activeMs(Date.now())).toBe(IDLE_TIMEOUT_MS)
    expect(timer.isRunning(Date.now())).toBe(false)
    expect(timer.minutes(Date.now())).toBe(2)
  })

  it('reprend à la prochaine interaction sans compter l’inactivité', () => {
    const timer = start()
    vi.advanceTimersByTime(10 * MINUTE)
    timer.touch(Date.now())
    expect(timer.isRunning(Date.now())).toBe(true)
    vi.advanceTimersByTime(MINUTE)
    expect(timer.activeMs(Date.now())).toBe(IDLE_TIMEOUT_MS + MINUTE)
  })

  it('compte les 2 min qui suivent la dernière interaction avant de s’arrêter', () => {
    const timer = start()
    vi.advanceTimersByTime(30 * SECOND)
    timer.touch(Date.now())
    vi.advanceTimersByTime(5 * MINUTE)
    expect(timer.activeMs(Date.now())).toBe(30 * SECOND + IDLE_TIMEOUT_MS)
  })

  it('s’arrête quand l’onglet est caché et reprend à son retour', () => {
    const timer = start()
    vi.advanceTimersByTime(MINUTE)
    timer.pause(Date.now())
    vi.advanceTimersByTime(30 * MINUTE)
    expect(timer.activeMs(Date.now())).toBe(MINUTE)
    expect(timer.isRunning(Date.now())).toBe(false)
    timer.touch(Date.now())
    expect(timer.isRunning(Date.now())).toBe(false)

    timer.resume(Date.now())
    vi.advanceTimersByTime(MINUTE)
    expect(timer.activeMs(Date.now())).toBe(2 * MINUTE)
  })

  it('ne double-compte pas une pause répétée', () => {
    const timer = start()
    vi.advanceTimersByTime(MINUTE)
    timer.pause(Date.now())
    vi.advanceTimersByTime(MINUTE)
    timer.pause(Date.now())
    timer.resume(Date.now())
    timer.resume(Date.now())
    vi.advanceTimersByTime(MINUTE)
    expect(timer.activeMs(Date.now())).toBe(2 * MINUTE)
  })

  it('plafonne la pause d’un onglet caché resté inactif avant d’être masqué', () => {
    const timer = start()
    vi.advanceTimersByTime(10 * MINUTE)
    timer.pause(Date.now())
    expect(timer.activeMs(Date.now())).toBe(IDLE_TIMEOUT_MS)
  })

  it('arrondit à la minute la plus proche, 0 sous 30 s', () => {
    const timer = start()
    vi.advanceTimersByTime(29 * SECOND)
    expect(timer.minutes(Date.now())).toBe(0)
    vi.advanceTimersByTime(SECOND)
    expect(timer.minutes(Date.now())).toBe(1)
  })

  it('accepte un seuil d’inactivité personnalisé', () => {
    const timer = createSessionTimer(Date.now(), 10 * SECOND)
    vi.advanceTimersByTime(MINUTE)
    expect(timer.activeMs(Date.now())).toBe(10 * SECOND)
  })
})
