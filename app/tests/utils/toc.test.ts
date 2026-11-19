import { describe, expect, it } from 'vitest'
import type { ReaderTocEntry } from '~/types/reader'
import {
  buildSpineToc,
  currentTocEntry,
  describeSection,
  entryFraction,
  fractionInSection,
  isNoteTocItem,
  needsSpineToc,
  splitToc,
  type SpineSection,
} from '~/utils/toc'

const LONG =
  'Le vent traversait la plaine silencieuse tandis que les voyageurs marchaient. '.repeat(8)

function doc(body: string, title = 'I'): Document {
  return new DOMParser().parseFromString(
    `<html><head><title>${title}</title></head><body>${body}</body></html>`,
    'text/html',
  )
}

const empty = '<p> </p><p>&nbsp;</p>'

describe('isNoteTocItem', () => {
  it('reconnaît les appels de notes', () => {
    expect(isNoteTocItem({ label: '[1]', href: 'notes.htm#_ftn1' })).toBe(true)
    expect(isNoteTocItem({ label: '[12]', href: 'c1.xhtml' })).toBe(true)
    expect(isNoteTocItem({ label: '*', href: 'c1.xhtml#x' })).toBe(true)
    expect(isNoteTocItem({ label: '3', href: 'c1.xhtml#fn3' })).toBe(true)
    expect(isNoteTocItem({ label: 'Note', href: 'c1.xhtml#endnote-4' })).toBe(true)
    expect(isNoteTocItem({ label: 'a', href: 'c1.xhtml#x', type: ['footnote'] })).toBe(true)
  })

  it('garde les vrais chapitres, même numérotés', () => {
    expect(isNoteTocItem({ label: '3', href: 'c3.xhtml' })).toBe(false)
    expect(isNoteTocItem({ label: '3', href: 'book.xhtml#ch3' })).toBe(false)
    expect(isNoteTocItem({ label: 'Notes', href: 'notes.xhtml' })).toBe(false)
    expect(isNoteTocItem({ label: 'I', href: 'c1.xhtml#chapter-1' })).toBe(false)
  })
})

describe('splitToc', () => {
  it('aplatit le sommaire avec la profondeur', () => {
    expect(
      splitToc([
        { label: ' Partie I ', href: 'p1.xhtml', subitems: [{ label: 'I', href: 'c1.xhtml' }] },
        { label: 'Sans lien', subitems: [{ label: 'II', href: 'c2.xhtml' }] },
      ]),
    ).toEqual({
      entries: [
        { label: 'Partie I', href: 'p1.xhtml', depth: 0 },
        { label: 'I', href: 'c1.xhtml', depth: 1 },
        { label: 'II', href: 'c2.xhtml', depth: 1 },
      ],
      notes: [],
    })
  })

  it('met les notes à part (sommaire Calibre fait de notes seulement)', () => {
    const toc = splitToc(
      Array.from({ length: 10 }, (_, i) => ({
        label: `[${i + 1}]`,
        href: `Steinbeck_split_014.htm#_ftn${i + 1}`,
      })),
    )
    expect(toc.entries).toEqual([])
    expect(toc.notes).toHaveLength(10)
    expect(toc.notes[2]).toEqual({ label: '[3]', href: 'Steinbeck_split_014.htm#_ftn3', depth: 0 })
  })

  it('sépare notes et chapitres mêlés', () => {
    const toc = splitToc([
      { label: 'Chapitre 1', href: 'c1.xhtml', subitems: [{ label: '[1]', href: 'c1.xhtml#fn1' }] },
      { label: 'Chapitre 2', href: 'c2.xhtml' },
    ])
    expect(toc.entries.map((e) => e.label)).toEqual(['Chapitre 1', 'Chapitre 2'])
    expect(toc.notes.map((e) => e.label)).toEqual(['[1]'])
  })
})

describe('needsSpineToc', () => {
  const entry = { label: 'x', href: 'x', depth: 0 }
  it('reconstruit quand le sommaire est (presque) vide', () => {
    expect(needsSpineToc([], 15)).toBe(true)
    expect(needsSpineToc([entry], 15)).toBe(true)
    expect(needsSpineToc([entry, entry], 15)).toBe(false)
    expect(needsSpineToc([], 2)).toBe(false)
  })
})

describe('describeSection', () => {
  it('repère une section réduite à un intitulé', () => {
    const s = describeSection(doc(`${empty}<div><p><span>I</span></p></div>`))
    expect(s).toMatchObject({ title: 'I', firstBlock: 'I', blockCount: 1, textLength: 1 })
    expect(s.marks).toEqual([])
  })

  it('lit le premier titre et le premier bloc court', () => {
    const s = describeSection(doc(`${empty}<p>PRÉFACE</p><p>${LONG}</p>`, 'Steinbeck'))
    expect(s.firstBlock).toBe('PRÉFACE')
    expect(s.heading).toBeNull()
    expect(describeSection(doc(`<h2>Le départ</h2><p>${LONG}</p>`)).heading).toBe('Le départ')
    expect(describeSection(doc(`<p>${LONG}</p>`)).firstBlock).toBeNull()
  })

  it('repère les intitulés de chapitre au milieu du texte', () => {
    const s = describeSection(
      doc(`<p>${LONG}</p><p>${LONG}</p><p>V</p><p>${LONG}</p><p>Il dit : « I. »</p>`),
    )
    expect(s.marks.map((m) => m.label)).toEqual(['V'])
    expect(s.marks[0]!.offset).toBeGreaterThan(0.6)
    expect(s.marks[0]!.offset).toBeLessThan(0.7)
    expect(s.marks[0]!.element.textContent).toBe('V')
  })

  it("repère l'image d'une couverture", () => {
    const s = describeSection(doc('<div><svg><image href="cover.jpeg"/></svg></div>', 'Cover'))
    expect(s).toMatchObject({ hasImage: true, textLength: 0 })
  })
})

describe('buildSpineToc', () => {
  // Calqué sur « Des souris et des hommes » (Calibre 0.7) : tous les <title> valent « I ».
  const bodies = [
    '<div><svg><image href="cover.jpeg"/></svg></div>',
    `${empty}<p>John Steinbeck</p><p>Des souris et des hommes</p><p>Gallimard</p>`,
    `${empty}<p>Titre original : OF MICE AND MEN</p><p>© Éditions Gallimard, 1949.</p>`,
    `${empty}<p>PRÉFACE</p><p>${LONG}</p>`,
    `${empty}<p>INTRODUCTION</p><p>JOHN STEINBECK, ROMANCIER CALIFORNIEN</p><p>${LONG}</p>`,
    `${empty}<p>I</p>`,
    `${empty}<p>${LONG}</p>`,
    `${empty}<p>II</p>`,
    `${empty}<p>${LONG}</p><p>III</p><p>${LONG}</p>`,
    `${empty}<p>DU MÊME AUTEUR</p><p>${LONG}</p>`,
    `<p>Cet ouvrage a été composé et achevé d'imprimer par l'Imprimerie Floch à Mayenne.</p><p id="_ftn1">[1] ${LONG}</p>`,
    `<p>${LONG}</p>`,
  ]
  const sections: SpineSection[] = bodies.map((body, index) => ({
    index,
    href: `s${index}.htm`,
    summary: describeSection(doc(body, index === 0 ? 'Cover' : 'I')),
  }))
  const options = {
    bookTitle: 'Des souris et des hommes',
    noteHrefs: new Set(['s10.htm']),
    notesLabel: 'Notes',
    sectionLabel: (n: number) => `Section ${n}`,
    markHref: (s: SpineSection, m: { label: string }) => `${s.href}#mark-${m.label}`,
  }

  it('nomme les sections, fusionne les intitulés seuls et écarte la page de titre', () => {
    expect(buildSpineToc(sections, options)).toEqual([
      { label: 'PRÉFACE', href: 's3.htm', depth: 0, index: 3, offset: 0 },
      { label: 'INTRODUCTION', href: 's4.htm', depth: 0, index: 4, offset: 0 },
      { label: 'I', href: 's5.htm', depth: 0, index: 5, offset: 0 },
      { label: 'II', href: 's7.htm', depth: 0, index: 7, offset: 0 },
      expect.objectContaining({ label: 'III', href: 's8.htm#mark-III', index: 8 }),
      { label: 'DU MÊME AUTEUR', href: 's9.htm', depth: 0, index: 9, offset: 0 },
      { label: 'Notes', href: 's10.htm', depth: 0, index: 10, offset: 0 },
      { label: 'Section 8', href: 's11.htm', depth: 0, index: 11, offset: 0 },
    ])
  })

  it('préfère un <title> propre à la section', () => {
    const titled = [0, 1, 2].map((index) => ({
      index,
      href: `c${index}.xhtml`,
      summary: describeSection(doc(`<p>${LONG}</p>`, `Chapitre ${index + 1}`)),
    }))
    expect(buildSpineToc(titled, options).map((e) => e.label)).toEqual([
      'Chapitre 1',
      'Chapitre 2',
      'Chapitre 3',
    ])
  })

  it('garde deux intitulés qui se suivent (partie puis chapitre)', () => {
    const parts = ['<p>PREMIÈRE PARTIE</p>', '<p>I</p>', `<p>${LONG}</p>`].map((body, index) => ({
      index,
      href: `p${index}.xhtml`,
      summary: describeSection(doc(body)),
    }))
    expect(buildSpineToc(parts, options).map((e) => e.label)).toEqual(['PREMIÈRE PARTIE', 'I'])
  })

  it('donne une entrée générique à une section illisible', () => {
    expect(buildSpineToc([{ index: 0, href: 'x.xhtml', summary: null }], options)).toEqual([
      { label: 'Section 1', href: 'x.xhtml', depth: 0, index: 0, offset: 0 },
    ])
  })
})

describe('position dans le sommaire', () => {
  const entries: ReaderTocEntry[] = [
    { label: 'I', href: 's5.htm', depth: 0, index: 5, offset: 0 },
    { label: 'II', href: 's7.htm', depth: 0, index: 7, offset: 0 },
    { label: 'III', href: 'epubcfi(/6/18!/4/2)', depth: 0, index: 8, offset: 0.5 },
  ]
  const fractions = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1]

  it('fractionInSection', () => {
    expect(fractionInSection(0.85, 8, fractions)).toBeCloseTo(0.5)
    expect(fractionInSection(0.5, 8, fractions)).toBe(0)
    expect(fractionInSection(0.5, 20, fractions)).toBe(0)
  })

  it('entryFraction', () => {
    expect(entryFraction(entries[2]!, fractions)).toBeCloseTo(0.85)
    expect(entryFraction({ label: 'x', href: 'x', depth: 0, index: -1 }, fractions)).toBeNull()
  })

  it('prend la dernière entrée commencée, jamais une note désignée par foliate', () => {
    expect(currentTocEntry(entries, { index: 2, offset: 0 })).toBeNull()
    expect(currentTocEntry(entries, { index: 6, offset: 0.9, href: 'n.htm#_ftn3' })?.label).toBe(
      'I',
    )
    expect(currentTocEntry(entries, { index: 8, offset: 0.4 })?.label).toBe('II')
    expect(currentTocEntry(entries, { index: 8, offset: 0.6 })?.label).toBe('III')
    expect(currentTocEntry(entries, { index: 10, offset: 0 })?.label).toBe('III')
  })

  it('situe exactement un intitulé interne quand un test précis est fourni', () => {
    const reached = (e: ReaderTocEntry) => e.label === 'III'
    expect(currentTocEntry(entries, { index: 8, offset: 0.1, reached })?.label).toBe('III')
    const never = () => false
    expect(currentTocEntry(entries, { index: 8, offset: 0.9, reached: never })?.label).toBe('II')
  })

  it("préfère l'entrée désignée par foliate quand elle fait partie du sommaire", () => {
    expect(currentTocEntry(entries, { index: 8, offset: 0.1, href: 's5.htm' })?.label).toBe('I')
  })
})
