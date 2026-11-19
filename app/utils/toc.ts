import type { ReaderToc, ReaderTocEntry } from '~/types/reader'

/**
 * Normalisation du sommaire d'un EPUB (fonctions pures, sans foliate).
 *
 * Certains EPUB (conversions Calibre de fichiers Word, notamment) n'ont dans leur sommaire que
 * les appels de notes (« [1] » vers `notes.htm#_ftn1`). On sépare ces notes des vraies entrées et,
 * s'il ne reste presque rien, on reconstruit un sommaire à partir des sections du spine.
 */

/** Nœud du sommaire tel que le donne foliate (NCX ou nav EPUB 3). */
export interface TocNode {
  label?: string | null
  href?: string | null
  /** `epub:type` de l'entrée, quand le format le fournit. */
  type?: readonly string[] | null
  subitems?: readonly TocNode[] | null
}

/** Libellés d'appel de note : `[1]`, `[a]`, `(12)`, `*`, `†`… */
const NOTE_LABEL = /^(\[\s*[\da-z*†‡]{1,4}\s*\]|\(\s*\d{1,4}\s*\)|\*{1,3}|†{1,3}|‡{1,3})$/i
/** Ancres de notes : `_ftn1` (Word), `fn3`, `note-12`, `endnote_5`, `_ftnref1`… */
const NOTE_FRAGMENT =
  /^_?(ftn|edn|fn|footnote|endnote|rearnote|note)s?(ref)?[-_.:]?[a-z]?\d+[a-z]?$/i
const NOTE_TYPES = new Set([
  'footnote',
  'footnotes',
  'endnote',
  'endnotes',
  'rearnote',
  'rearnotes',
  'note',
  'noteref',
])

function clean(text: string | null | undefined): string {
  return (text ?? '').replace(/\s+/g, ' ').trim()
}

function fragmentOf(href: string): string {
  const hash = href.indexOf('#')
  return hash < 0 ? '' : href.slice(hash + 1)
}

/** Chemin d'une cible, sans l'ancre. */
export function hrefPath(href: string): string {
  const hash = href.indexOf('#')
  return hash < 0 ? href : href.slice(0, hash)
}

/**
 * Une entrée de sommaire est-elle un appel de note ? Libellé `[n]`/`*`, ancre de note ou
 * `epub:type` de note. Un numéro seul (« 3 ») ne suffit pas : c'est souvent un chapitre.
 */
export function isNoteTocItem(item: TocNode): boolean {
  const label = clean(item.label)
  if (item.type?.some((t) => NOTE_TYPES.has(t))) return true
  if (NOTE_LABEL.test(label)) return true
  const fragment = item.href ? fragmentOf(item.href) : ''
  return !!fragment && NOTE_FRAGMENT.test(fragment)
}

/** Aplatit le sommaire foliate (profondeur pour l'indentation) et met les notes à part. */
export function splitToc(items: readonly TocNode[] | null | undefined): ReaderToc {
  const toc: ReaderToc = { entries: [], notes: [] }
  const walk = (nodes: readonly TocNode[] | null | undefined, depth: number) => {
    for (const node of nodes ?? []) {
      const note = isNoteTocItem(node)
      if (node.href) {
        const entry = { label: clean(node.label) || node.href, href: node.href }
        if (note) toc.notes.push({ ...entry, depth: 0 })
        else toc.entries.push({ ...entry, depth })
      }
      walk(node.subitems, note ? depth : depth + 1)
    }
  }
  walk(items, 0)
  return toc
}

/** Moins de deux vraies entrées pour un livre de plusieurs sections : sommaire à reconstruire. */
export function needsSpineToc(entries: readonly ReaderTocEntry[], sectionCount: number): boolean {
  return entries.length < 2 && sectionCount >= 3
}

// --- Lecture des sections -----------------------------------------------------------------

/** Libellé court : au-delà, un premier paragraphe n'est plus un titre. */
export const SHORT_LABEL = 60

const BLOCKS = 'h1, h2, h3, h4, h5, h6, p, div, li, blockquote, dd, dt, td, th, figcaption, pre'
const HEADINGS = new Set(['h1', 'h2', 'h3'])
/** Intitulé de chapitre au fil du texte : chiffre romain seul (en capitales) ou « Chapitre 3 ». */
const ROMAN = /^(?=[IVXLC])C{0,3}(XC|XL|L?X{0,3})(IX|IV|V?I{0,3})\.?$/
const CHAPTER_WORD = /^(chapitre|chapter|partie|part|livre|book)\s+([\divxlc]+|[a-zà-ÿ]+)\b/i

function isChapterHeading(text: string): boolean {
  return ROMAN.test(text) || CHAPTER_WORD.test(text)
}

/** Intitulé repéré dans le corps d'une section (début d'un chapitre au milieu d'un fichier). */
export interface SectionMark {
  label: string
  /** Position dans la section, de 0 à 1 (sur le texte). */
  offset: number
  element: Element
}

/** Ce qu'il faut savoir d'une section du spine pour la nommer. */
export interface SectionSummary {
  /** Contenu de `<title>`. */
  title: string
  /** Premier titre `h1`-`h3`. */
  heading: string | null
  /** Premier bloc de texte non vide, s'il est court (≤ 60 caractères). */
  firstBlock: string | null
  /** Nombre de blocs de texte non vides. */
  blockCount: number
  textLength: number
  /** Début du texte (repérage des pages de titre et mentions légales). */
  excerpt: string
  hasImage: boolean
  /** `epub:type` du corps et de ses premiers éléments (`cover`, `titlepage`…). */
  types: string[]
  marks: SectionMark[]
}

function epubTypes(el: Element | null): string[] {
  const value =
    el?.getAttribute('epub:type') ??
    el?.getAttributeNS?.('http://www.idpf.org/2007/ops', 'type') ??
    ''
  return value.split(/\s+/).filter(Boolean)
}

/** Résume une section (document XHTML) : titres, premier bloc, intitulés internes, longueur. */
export function describeSection(doc: Document): SectionSummary {
  const body = doc.body ?? doc.querySelector('body')
  const summary: SectionSummary = {
    title: clean(doc.querySelector('title')?.textContent),
    heading: null,
    firstBlock: null,
    blockCount: 0,
    textLength: 0,
    excerpt: '',
    hasImage: !!body?.querySelector('img, svg, image'),
    types: [
      ...epubTypes(body),
      ...[...(body?.children ?? [])].slice(0, 3).flatMap((child) => epubTypes(child)),
    ],
    marks: [],
  }
  if (!body) return summary

  // Blocs « feuilles » (sans bloc imbriqué) et leur position dans le texte de la section.
  const blocks: { el: Element; text: string; at: number }[] = []
  const walker = doc.createTreeWalker(body, 0x1 | 0x4) // éléments et textes
  let length = 0
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node.nodeType === 3) {
      length += (node.nodeValue ?? '').replace(/\s+/g, ' ').length
      continue
    }
    const el = node as Element
    if (!el.matches(BLOCKS) || el.querySelector(BLOCKS)) continue
    const text = clean(el.textContent)
    if (text) blocks.push({ el, text, at: length })
  }
  summary.textLength = blocks.reduce((sum, b) => sum + b.text.length, 0)
  summary.blockCount = blocks.length
  summary.excerpt = blocks
    .map((b) => b.text)
    .join(' ')
    .slice(0, FRONT_MATTER_LENGTH)

  const first = blocks[0]
  if (first && first.text.length <= SHORT_LABEL) summary.firstBlock = first.text
  const heading = blocks.find((b) => HEADINGS.has(b.el.localName.toLowerCase()))
  if (heading && heading.text.length <= SHORT_LABEL * 2) summary.heading = heading.text

  for (const block of blocks) {
    if (block === first || block === heading || block.text.length > SHORT_LABEL) continue
    if (HEADINGS.has(block.el.localName.toLowerCase()) || isChapterHeading(block.text)) {
      summary.marks.push({
        label: block.text,
        offset: length ? block.at / length : 0,
        element: block.el,
      })
    }
  }
  return summary
}

// --- Reconstruction depuis le spine --------------------------------------------------------

export interface SpineSection {
  /** Index dans `book.sections`. */
  index: number
  href: string
  /** `null` si la section n'a pas pu être lue. */
  summary: SectionSummary | null
}

export interface SpineTocOptions {
  bookTitle?: string | null
  /** Sections visées par les notes du sommaire (chemins sans ancre). */
  noteHrefs?: ReadonlySet<string>
  /** Couverture et page de titre déclarées par le livre (repères, guide). */
  coverHrefs?: ReadonlySet<string>
  notesLabel: string
  sectionLabel: (n: number) => string
  /** Cible d'un intitulé repéré au milieu d'une section (ancre ou CFI). */
  markHref: (section: SpineSection, mark: SectionMark) => string
}

const GENERIC_TITLE =
  /^(untitled|unknown|sans titre|inconnu|document|cover|couverture|title ?page|page de titre|table of contents|contents|sommaire|table des matières|\d+)$/i
const FILE_LIKE =
  /(_split_\d+|\.x?html?$|^(part|chapter|chap|ch|section|text|index|page)[-_]?\d+$|^[\w-]*\d{3,}[\w-]*$)/i
const COVER_TYPES = new Set(['cover', 'titlepage', 'title-page', 'halftitlepage', 'copyright-page'])
const FRONT_MATTER =
  /©|copyright|isbn|tous droits|all rights reserved|titre original|original title/i
/** Au-delà, une section n'est plus de la page de titre ou de garde. */
const FRONT_MATTER_LENGTH = 500

/** Page de titre ou mentions légales : texte court qui reprend le titre du livre ou un ©. */
function isFrontMatter(s: SectionSummary, bookTitle: string): boolean {
  if (s.textLength >= FRONT_MATTER_LENGTH) return false
  return (!!bookTitle && normalize(s.excerpt).includes(bookTitle)) || FRONT_MATTER.test(s.excerpt)
}

function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .toLowerCase()
}

/**
 * Sommaire reconstruit à partir des sections du spine (dans l'ordre de lecture) :
 * - libellé : `<title>` s'il est propre à la section, sinon premier titre h1-h3, « Notes » pour
 *   la section des notes, premier bloc court, ou « Section N » ;
 * - une section réduite à un intitulé (« I ») annonce la suivante : une seule entrée, qui pointe
 *   sur l'intitulé ;
 * - couverture, page de titre et mentions légales en tête de livre sont écartées ;
 * - les intitulés de chapitre repérés au milieu d'une section donnent leurs propres entrées.
 */
export function buildSpineToc(
  sections: readonly SpineSection[],
  options: SpineTocOptions,
): ReaderTocEntry[] {
  const titleCount = new Map<string, number>()
  for (const s of sections) {
    const key = normalize(s.summary?.title ?? '')
    titleCount.set(key, (titleCount.get(key) ?? 0) + 1)
  }
  const bookTitle = normalize(options.bookTitle ?? '')
  const ownTitle = (summary: SectionSummary): string | null => {
    const key = normalize(summary.title)
    if (!key || key === bookTitle || (titleCount.get(key) ?? 0) > 1) return null
    if (GENERIC_TITLE.test(summary.title) || FILE_LIKE.test(summary.title)) return null
    return summary.title
  }

  const entries: ReaderTocEntry[] = []
  let inFrontMatter = true
  let announced = false // l'entrée précédente n'était qu'un intitulé : elle couvre cette section

  for (const section of sections) {
    const s = section.summary
    if (!s) {
      announced = false
      entries.push({
        label: options.sectionLabel(entries.length + 1),
        href: section.href,
        depth: 0,
        index: section.index,
        offset: 0,
      })
      continue
    }
    const cover =
      options.coverHrefs?.has(section.href) ||
      s.types.some((t) => COVER_TYPES.has(t)) ||
      (!s.textLength && !s.marks.length)
    if (cover || (inFrontMatter && isFrontMatter(s, bookTitle))) continue
    inFrontMatter = false

    const headingOnly = s.blockCount === 1 && s.textLength <= SHORT_LABEL && !s.marks.length
    if (!announced || headingOnly) {
      const label =
        ownTitle(s) ??
        s.heading ??
        (options.noteHrefs?.has(section.href) ? options.notesLabel : null) ??
        s.firstBlock ??
        options.sectionLabel(entries.length + 1)
      entries.push({ label, href: section.href, depth: 0, index: section.index, offset: 0 })
    }
    announced = headingOnly

    for (const mark of s.marks) {
      entries.push({
        label: mark.label,
        href: options.markHref(section, mark),
        depth: 0,
        index: section.index,
        offset: mark.offset,
      })
    }
  }
  return entries
}

// --- Position ------------------------------------------------------------------------------

/** Où se trouve le lecteur : section du spine, position dans la section, entrée foliate. */
export interface TocLocation {
  index: number
  /** Position dans la section, de 0 à 1. */
  offset: number
  /** Cible de l'entrée de sommaire que foliate juge courante. */
  href?: string | null
  /**
   * Test exact pour une entrée au milieu de la section courante (comparaison de CFI) ; à défaut
   * (`undefined`), on compare `offset`, une estimation sur le texte.
   */
  reached?: (entry: ReaderTocEntry) => boolean | undefined
}

/**
 * Position dans une section, de 0 à 1, d'après la progression globale et les débuts de section
 * (`sectionFractions` de foliate : une valeur de plus que de sections).
 */
export function fractionInSection(
  fraction: number,
  index: number,
  sectionFractions: readonly number[],
): number {
  const start = sectionFractions[index]
  const end = sectionFractions[index + 1]
  if (start === undefined || end === undefined || end <= start) return 0
  return Math.min(1, Math.max(0, (fraction - start) / (end - start)))
}

/** Début d'une entrée dans le livre, de 0 à 1 (`null` si sa section est inconnue). */
export function entryFraction(
  entry: ReaderTocEntry,
  sectionFractions: readonly number[],
): number | null {
  const index = entry.index ?? -1
  const start = sectionFractions[index]
  if (index < 0 || start === undefined) return null
  const end = sectionFractions[index + 1] ?? start
  return start + (entry.offset ?? 0) * (end - start)
}

function isBefore(a: ReaderTocEntry, b: ReaderTocEntry): boolean {
  const [ia, ib] = [a.index ?? -1, b.index ?? -1]
  return ia < ib || (ia === ib && (a.offset ?? 0) < (b.offset ?? 0))
}

/**
 * Entrée du sommaire normalisé où se trouve le lecteur. L'entrée choisie par foliate l'emporte
 * si elle en fait partie (ancres précises) ; sinon (foliate désigne une note, ou le sommaire a
 * été reconstruit), la dernière entrée commencée d'après la section et la position.
 */
export function currentTocEntry(
  entries: readonly ReaderTocEntry[],
  at: TocLocation,
): ReaderTocEntry | null {
  if (at.href) {
    const exact = entries.find((e) => e.href === at.href)
    if (exact) return exact
  }
  let current: ReaderTocEntry | null = null
  for (const entry of entries) {
    const index = entry.index ?? -1
    if (index < 0) continue
    const offset = entry.offset ?? 0
    const reached =
      index < at.index ||
      (index === at.index && (offset === 0 || (at.reached?.(entry) ?? offset <= at.offset)))
    if (reached && (!current || !isBefore(entry, current))) current = entry
  }
  return current
}
