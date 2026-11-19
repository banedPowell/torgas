import { describe, expect, it } from 'vitest'
import { createWheelGesture, wheelSide } from '~/utils/wheel'

const wheel = (deltaX: number, timeStamp: number, deltaY = 0) => ({ deltaX, deltaY, timeStamp })

/** Rejoue un geste : `deltas` toutes les 16 ms à partir de `t0`. */
function play(gesture: ReturnType<typeof createWheelGesture>, deltas: number[], t0 = 0) {
  return deltas.map((d, i) => gesture.push(wheel(d, t0 + i * 16), 800))
}

describe('createWheelGesture', () => {
  it('suit les doigts pixel par pixel, sans dépasser une page', () => {
    const gesture = createWheelGesture()
    const steps = play(gesture, [10, 20, 30])
    expect(steps.map((s) => s.move)).toEqual([10, 20, 30])
    expect(steps.at(-1)!.offset).toBe(60)
    const big = play(gesture, Array(20).fill(100), 48)
    expect(big.at(-1)!.offset).toBe(800)
    expect(big.at(-1)!.move).toBe(0)
  })

  it('tourne la page après une distance suffisante', () => {
    const gesture = createWheelGesture()
    play(gesture, [8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8])
    expect(gesture.finish()).toEqual({ commit: 1, offset: 104 })
  })

  it('tourne sur un geste court mais vif, dans les deux sens', () => {
    const gesture = createWheelGesture()
    play(gesture, [-25, -30])
    expect(gesture.finish().commit).toBe(-1)
    expect(wheelSide(-1)).toBe('left')
    expect(wheelSide(1)).toBe('right')
  })

  it('revient à la page de départ sur un petit geste lent ou annulé', () => {
    const gesture = createWheelGesture()
    play(gesture, [2, 2, 2])
    expect(gesture.finish()).toEqual({ commit: 0, offset: 6 })
    play(gesture, [30, 30, 30, 30, -20, -20], 1000)
    expect(gesture.finish().commit).toBe(0)
  })

  it('ignore un geste vertical et le pincement', () => {
    const gesture = createWheelGesture()
    expect(gesture.push(wheel(5, 0, 40), 800)).toEqual({ consume: false, move: 0, offset: 0 })
    expect(gesture.push(wheel(40, 16), 800).consume).toBe(false)
    expect(gesture.finish().commit).toBe(0)
    expect(gesture.push({ ...wheel(40, 1000), ctrlKey: true }, 800).consume).toBe(false)
  })

  it('garde le geste ouvert pendant une pause doigts posés', () => {
    const gesture = createWheelGesture()
    play(gesture, [20, 20])
    // Arrêt net : doigts sans doute encore posés, on attend longtemps avant d'aimanter.
    expect(gesture.endDelay()).toBe(1200)
    // Ils repartent une seconde plus tard : même geste, même décalage.
    expect(gesture.push(wheel(20, 1000), 800).offset).toBe(60)
  })

  it("aimante vite quand l'inertie s'éteint (doigts levés)", () => {
    const gesture = createWheelGesture()
    play(gesture, [30, 30, 20, 9, 4, 2, 1])
    expect(gesture.endDelay()).toBe(90)
    expect(gesture.finish().commit).toBe(1)
  })

  it('commence un nouveau geste après la fin du précédent', () => {
    const gesture = createWheelGesture()
    play(gesture, [50])
    gesture.finish()
    expect(gesture.push(wheel(10, 500), 800).offset).toBe(10)
  })
})
