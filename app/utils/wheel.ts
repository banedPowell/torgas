/** Côté vers lequel tourner la page après un geste horizontal au trackpad. */
export type WheelSide = 'left' | 'right'

export interface WheelLike {
  deltaX: number
  deltaY: number
  /** 0 : pixels ; 1 : lignes ; 2 : pages. */
  deltaMode?: number
  /** Pincement au trackpad (zoom) : jamais un tour de page. */
  ctrlKey?: boolean
  /** Horodatage en ms (une seule horloge pour tout le geste). */
  timeStamp: number
}

export interface WheelGestureOptions {
  /** Silence (ms) au-delà duquel un nouvel événement commence un nouveau geste. */
  gestureGap?: number
  /** Part de la page à parcourir pour tourner sans élan. */
  distanceRatio?: number
  /** Vitesse (px/ms) d'un geste vif qui tourne la page même s'il est court. */
  flickVelocity?: number
}

/** Fin d'un geste : -1 page de gauche, 1 page de droite, 0 retour à la page de départ. */
export type WheelCommit = -1 | 0 | 1

/**
 * Suivi d'un glissement à deux doigts au trackpad, façon Livres d'Apple : la page suit les
 * doigts (puis l'inertie du trackpad) pixel par pixel, sans dépasser une page, et à la fin du
 * geste on décide de tourner (distance parcourue ou geste vif) ou de revenir.
 *
 * `push` renvoie le déplacement à appliquer (px, positif vers la page de droite) ; l'appelant
 * appelle `finish` après `gestureGap` ms sans événement. Un geste qui commence surtout vertical
 * (molette, défilement) est ignoré en entier.
 */
export function createWheelGesture(options: WheelGestureOptions = {}) {
  const gestureGap = options.gestureGap ?? 160
  const distanceRatio = options.distanceRatio ?? 0.12
  const flickVelocity = options.flickVelocity ?? 0.6

  let active = false
  let horizontal = false
  let last = -Infinity
  let offset = 0
  let peakVelocity = 0
  let velocity = 0
  let size = 1

  /** `consume` : événement à intercepter ; `move` : déplacement à appliquer ; `offset` : total. */
  function push(e: WheelLike, pageSize: number) {
    const scale = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? pageSize : 1
    const dx = e.deltaX * scale
    const dy = e.deltaY * scale
    const dt = e.timeStamp - last
    if (!active || dt > gestureGap) {
      active = true
      horizontal = !e.ctrlKey && Math.abs(dx) > Math.abs(dy)
      offset = 0
      peakVelocity = 0
      velocity = 0
      size = Math.max(1, pageSize)
    }
    last = e.timeStamp
    if (!horizontal) return { consume: false, move: 0, offset }

    const next = Math.max(-size, Math.min(size, offset + dx))
    const move = next - offset
    offset = next
    const v = dx / Math.max(8, Math.min(dt, 50))
    velocity = 0.7 * v + 0.3 * velocity
    if (Math.sign(velocity) === Math.sign(offset)) {
      peakVelocity = Math.max(peakVelocity, Math.abs(velocity))
    }
    return { consume: true, move, offset }
  }

  /** Fin du geste : sens retenu et déplacement déjà appliqué (à compléter ou annuler). */
  function finish(): { commit: WheelCommit; offset: number } {
    const moved = offset
    const wasHorizontal = active && horizontal
    active = false
    horizontal = false
    offset = 0
    if (!wasHorizontal || moved === 0) return { commit: 0, offset: moved }
    const far = Math.abs(moved) >= distanceRatio * size
    const flick = peakVelocity >= flickVelocity
    // Revenir en arrière en fin de geste annule le tour de page.
    const reversed = Math.sign(velocity) === -Math.sign(moved) && Math.abs(velocity) > 0.2
    const commit = (far || flick) && !reversed ? (Math.sign(moved) as WheelCommit) : 0
    return { commit, offset: moved }
  }

  return { push, finish, gestureGap }
}

/** Côté physique visé par un geste validé (doigts vers la gauche → page de droite). */
export function wheelSide(commit: WheelCommit): WheelSide | null {
  return commit > 0 ? 'right' : commit < 0 ? 'left' : null
}
