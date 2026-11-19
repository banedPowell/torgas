import { describe, expect, it } from 'vitest'
import type { Work } from '~/types/core'
import {
  buildComicSpreads,
  clampComicPage,
  comicPageFromProgress,
  comicPreloadPages,
  comicProgress,
  comicStepForSide,
  comicTapAction,
  comicThumbnailWindow,
  findNextComicVolume,
  isComicPageKept,
  resolveComicLayout,
  spreadDisplayOrder,
  spreadIndexOf,
} from '~/utils/comic'
import { makeWork } from '../fixtures'

describe('resolveComicLayout', () => {
  it('passe en double page en paysage à partir de 1024 px', () => {
    expect(resolveComicLayout('auto', { width: 1280, height: 800 })).toBe('double')
    expect(resolveComicLayout('auto', { width: 1024, height: 768 })).toBe('double')
    expect(resolveComicLayout('auto', { width: 1000, height: 700 })).toBe('single')
    expect(resolveComicLayout('auto', { width: 1100, height: 1400 })).toBe('single')
    expect(resolveComicLayout('auto', { width: 390, height: 844 })).toBe('single')
  })

  it('respecte un choix explicite', () => {
    expect(resolveComicLayout('double', { width: 390, height: 844 })).toBe('double')
    expect(resolveComicLayout('single', { width: 1920, height: 1080 })).toBe('single')
    expect(resolveComicLayout('webtoon', { width: 1920, height: 1080 })).toBe('webtoon')
  })
})

describe('buildComicSpreads', () => {
  it('une page par planche en simple page', () => {
    expect(buildComicSpreads(3, 'single')).toEqual([[0], [1], [2]])
  })

  it('laisse la couverture seule puis groupe par deux', () => {
    expect(buildComicSpreads(6, 'double')).toEqual([[0], [1, 2], [3, 4], [5]])
    expect(buildComicSpreads(5, 'double')).toEqual([[0], [1, 2], [3, 4]])
    expect(buildComicSpreads(1, 'double')).toEqual([[0]])
  })

  it('gère un volume vide', () => {
    expect(buildComicSpreads(0, 'double')).toEqual([])
    expect(buildComicSpreads(-2, 'single')).toEqual([])
  })

  it('retrouve la planche d’une page', () => {
    const spreads = buildComicSpreads(6, 'double')
    expect(spreadIndexOf(spreads, 0)).toBe(0)
    expect(spreadIndexOf(spreads, 4)).toBe(2)
    expect(spreadIndexOf(spreads, 99)).toBe(0)
  })
})

describe('sens de lecture', () => {
  it('inverse l’ordre d’affichage en droite → gauche', () => {
    expect(spreadDisplayOrder([3, 4], 'ltr')).toEqual([3, 4])
    expect(spreadDisplayOrder([3, 4], 'rtl')).toEqual([4, 3])
    expect(spreadDisplayOrder([0], 'rtl')).toEqual([0])
  })

  it('droite = suivant en ltr, précédent en rtl', () => {
    expect(comicStepForSide('right', 'ltr')).toBe(1)
    expect(comicStepForSide('left', 'ltr')).toBe(-1)
    expect(comicStepForSide('right', 'rtl')).toBe(-1)
    expect(comicStepForSide('left', 'rtl')).toBe(1)
  })

  it('découpe l’écran en trois zones de tap', () => {
    expect(comicTapAction(10, 300, 'ltr')).toBe('prev')
    expect(comicTapAction(150, 300, 'ltr')).toBe('menu')
    expect(comicTapAction(290, 300, 'ltr')).toBe('next')
    expect(comicTapAction(10, 300, 'rtl')).toBe('next')
    expect(comicTapAction(290, 300, 'rtl')).toBe('prev')
    expect(comicTapAction(10, 0, 'ltr')).toBe('menu')
  })
})

describe('progression', () => {
  it('compte la dernière page visible', () => {
    expect(comicProgress(0, 4)).toBe(0.25)
    expect(comicProgress(3, 4)).toBe(1)
    expect(comicProgress(10, 4)).toBe(1)
    expect(comicProgress(0, 0)).toBe(0)
  })

  it('retrouve une page depuis la progression', () => {
    expect(comicPageFromProgress(0, 10)).toBe(0)
    expect(comicPageFromProgress(0.5, 10)).toBe(4)
    expect(comicPageFromProgress(1, 10)).toBe(9)
    expect(comicPageFromProgress(Number.NaN, 10)).toBe(0)
    expect(comicPageFromProgress(0.5, 0)).toBe(0)
  })

  it('borne les pages', () => {
    expect(clampComicPage(-3, 10)).toBe(0)
    expect(clampComicPage(12, 10)).toBe(9)
    expect(clampComicPage(4.7, 10)).toBe(4)
    expect(clampComicPage(4, 0)).toBe(0)
  })
})

describe('préchargement', () => {
  it('précharge les 3 pages suivantes sans dépasser la fin', () => {
    expect(comicPreloadPages(2, 10)).toEqual([3, 4, 5])
    expect(comicPreloadPages(8, 10)).toEqual([9])
    expect(comicPreloadPages(9, 10)).toEqual([])
  })

  it('libère les pages précédentes', () => {
    expect(isComicPageKept(4, 5, 6)).toBe(true)
    expect(isComicPageKept(3, 5, 6)).toBe(false)
    expect(isComicPageKept(9, 5, 6)).toBe(true)
    expect(isComicPageKept(10, 5, 6)).toBe(false)
  })
})

describe('findNextComicVolume', () => {
  const works: Work[] = [
    makeWork({ id: 'v1', title: 'Vol. 1', seriesId: 's', volume: 1 }),
    makeWork({ id: 'v2', title: 'Vol. 2', seriesId: 's', volume: 2 }),
    makeWork({ id: 'x2', title: 'Autre 2', seriesId: 'autre', volume: 2 }),
  ]

  it('trouve le volume + 1 de la même série', () => {
    expect(findNextComicVolume(works, works[0]!)?.id).toBe('v2')
  })

  it('ne trouve rien en fin de série ou hors série', () => {
    expect(findNextComicVolume(works, works[1]!)).toBeUndefined()
    expect(findNextComicVolume(works, makeWork({ id: 'seul', title: 'Seul' }))).toBeUndefined()
  })
})

describe('comicThumbnailWindow', () => {
  it('centre 7 miniatures sur la page courante', () => {
    expect(comicThumbnailWindow(10, 50)).toEqual([7, 8, 9, 10, 11, 12, 13])
    expect(comicThumbnailWindow(0, 50)).toEqual([0, 1, 2, 3, 4, 5, 6])
    expect(comicThumbnailWindow(49, 50)).toEqual([43, 44, 45, 46, 47, 48, 49])
    expect(comicThumbnailWindow(1, 3)).toEqual([0, 1, 2])
    expect(comicThumbnailWindow(0, 0)).toEqual([])
  })
})
