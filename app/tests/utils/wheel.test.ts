import { describe, expect, it } from 'vitest'
import { createWheelPager } from '~/utils/wheel'

const wheel = (deltaX: number, timeStamp: number, deltaY = 0) => ({ deltaX, deltaY, timeStamp })

describe('createWheelPager', () => {
  it('tourne une seule page par geste, inertie comprise', () => {
    const pager = createWheelPager()
    const sides = [0, 16, 32, 48, 64, 80, 96, 112].map((t) => pager.push(wheel(20, t)).side)
    expect(sides.filter(Boolean)).toEqual(['right'])
  })

  it('accepte un nouveau geste après un silence', () => {
    const pager = createWheelPager()
    pager.push(wheel(-30, 0))
    expect(pager.push(wheel(-30, 16)).side).toBe('left')
    expect(pager.push(wheel(-30, 100)).side).toBeNull()
    pager.push(wheel(-30, 400))
    expect(pager.push(wheel(-30, 416)).side).toBe('left')
  })

  it('ignore le défilement vertical et les petits mouvements', () => {
    const pager = createWheelPager()
    expect(pager.push(wheel(10, 0, 80))).toEqual({ side: null, horizontal: false })
    expect(pager.push(wheel(20, 16))).toEqual({ side: null, horizontal: true })
  })

  it('tient compte des deltas en lignes', () => {
    const pager = createWheelPager()
    expect(pager.push({ deltaX: 4, deltaY: 0, deltaMode: 1, timeStamp: 0 }).side).toBe('right')
  })
})
