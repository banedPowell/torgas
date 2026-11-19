/** Côté vers lequel tourner la page après un geste horizontal au trackpad. */
export type WheelSide = 'left' | 'right'

export interface WheelLike {
  deltaX: number
  deltaY: number
  /** 0 : pixels ; 1 : lignes ; 2 : pages (souris à crans sous Firefox). */
  deltaMode?: number
  timeStamp: number
}

export interface WheelPagerOptions {
  /** Distance horizontale cumulée (px) qui déclenche un changement de page. */
  threshold?: number
  /** Silence (ms) qui marque la fin d'un geste, inertie comprise. */
  gestureGap?: number
}

/**
 * Transforme les événements `wheel` d'un glissement à deux doigts en tours de page : une page
 * par geste, quelle que soit sa longueur. L'inertie du trackpad prolonge le flux d'événements
 * après le geste ; elle est ignorée jusqu'à un silence de `gestureGap` ms.
 * Les mouvements surtout verticaux ne comptent pas (défilement, molette).
 */
export function createWheelPager(options: WheelPagerOptions = {}) {
  const threshold = options.threshold ?? 50
  const gestureGap = options.gestureGap ?? 180
  let sum = 0
  let last = -Infinity
  let fired = false

  /** Renvoie le côté où aller, ou `null` ; `horizontal` dit si l'événement est à intercepter. */
  function push(e: WheelLike): { side: WheelSide | null; horizontal: boolean } {
    const scale = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1
    const dx = e.deltaX * scale
    const dy = e.deltaY * scale
    if (e.timeStamp - last > gestureGap) {
      sum = 0
      fired = false
    }
    last = e.timeStamp
    const horizontal = Math.abs(dx) > Math.abs(dy)
    if (!horizontal || fired) return { side: null, horizontal }
    sum += dx
    if (Math.abs(sum) < threshold) return { side: null, horizontal }
    fired = true
    // Doigts vers la gauche (deltaX > 0) : on avance vers la page de droite, comme un glissé tactile.
    return { side: sum > 0 ? 'right' : 'left', horizontal }
  }

  return { push }
}
