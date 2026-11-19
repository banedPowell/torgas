/** Inactivité au-delà de laquelle le chronomètre de lecture se met en pause (2 min). */
export const IDLE_TIMEOUT_MS = 2 * 60 * 1000

const MINUTE_MS = 60 * 1000

/**
 * Chronomètre de temps de lecture actif, sans minuteur : il ne manipule que des horodatages
 * (ms) fournis par l'appelant, ce qui le rend déterministe et testable avec de faux timers.
 *
 * Le temps compte tant que la dernière activité date de moins de `idleMs` et que l'onglet est
 * visible. Une activité après une pause ouvre un nouveau segment à cet instant : le temps
 * d'inactivité n'est jamais compté, hormis les `idleMs` qui suivent la dernière activité.
 */
export interface SessionTimer {
  /** Interaction (clic, touche, tap, défilement, changement de page). Ignorée si masqué. */
  touch(now: number): void
  /** Onglet caché : le temps cesse de courir. */
  pause(now: number): void
  /** Retour de l'onglet : reprise, comptée comme une activité. */
  resume(now: number): void
  /** Temps de lecture actif cumulé (ms). */
  activeMs(now: number): number
  /** Temps de lecture actif en minutes entières (arrondi à la minute la plus proche). */
  minutes(now: number): number
  /** Le chronomètre court-il à cet instant ? */
  isRunning(now: number): boolean
}

export function createSessionTimer(startedAt: number, idleMs = IDLE_TIMEOUT_MS): SessionTimer {
  let accumulated = 0
  let segmentStart: number | null = startedAt
  let lastActivity = startedAt
  let hidden = false

  /** Fin du segment en cours : maintenant, ou le seuil d'inactivité s'il est déjà passé. */
  function segmentEnd(now: number): number {
    return Math.min(now, lastActivity + idleMs)
  }

  function closeSegment(now: number): void {
    if (segmentStart === null) return
    accumulated += Math.max(0, segmentEnd(now) - segmentStart)
    segmentStart = null
  }

  function activeMs(now: number): number {
    if (segmentStart === null) return accumulated
    return accumulated + Math.max(0, segmentEnd(now) - segmentStart)
  }

  return {
    touch(now) {
      if (hidden) return
      if (segmentStart !== null && now - lastActivity >= idleMs) closeSegment(now)
      segmentStart ??= now
      lastActivity = now
    },
    pause(now) {
      if (hidden) return
      closeSegment(now)
      hidden = true
    },
    resume(now) {
      if (!hidden) return
      hidden = false
      segmentStart = now
      lastActivity = now
    },
    activeMs,
    minutes: (now) => Math.round(activeMs(now) / MINUTE_MS),
    isRunning: (now) => segmentStart !== null && now - lastActivity < idleMs,
  }
}
