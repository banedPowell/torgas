import type { ReaderToc, ReaderTocEntry } from '~/types/reader'
import type { FoliateBook, FoliateRelocateDetail } from '~/vendor/foliate-js/view.js'
import {
  buildSpineToc,
  currentTocEntry,
  describeSection,
  fractionInSection,
  hrefPath,
  needsSpineToc,
  splitToc,
} from '~/utils/toc'
import type { SectionMark, SpineSection } from '~/utils/toc'

export interface EpubTocLabels {
  /** Libellé de la section des notes reconstruite. */
  notes: string
  /** « Section N » quand rien ne nomme une section. */
  section: (n: number) => string
}

const COVER_LANDMARKS = ['cover', 'title-page', 'titlepage']

function bookTitle(book: FoliateBook): string {
  const title = book.metadata?.title
  if (typeof title === 'string') return title
  if (title && typeof title === 'object') return String(Object.values(title)[0] ?? '')
  return ''
}

/** Laisse la main au navigateur entre deux sections (ne bloque ni le rendu ni les saisies). */
function idle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

/**
 * Sommaire normalisé d'un livre ouvert par foliate : notes à part, et reconstruction depuis le
 * spine quand le sommaire n'a (presque) aucune vraie entrée. Les sections sont lues une à une
 * (`createDocument`, hors du rendu) ; `cancelled` interrompt la lecture (livre refermé).
 */
export async function loadEpubToc(
  book: FoliateBook,
  labels: EpubTocLabels,
  cancelled: () => boolean = () => false,
): Promise<ReaderToc> {
  const { entries, notes } = splitToc(book.toc)
  const indexOf = (href: string) => {
    try {
      return book.resolveHref?.(href)?.index ?? -1
    } catch {
      return -1
    }
  }
  for (const entry of [...entries, ...notes]) {
    entry.index = indexOf(entry.href)
    entry.offset = 0
  }
  const linear = book.sections
    .map((section, index) => ({ section, index }))
    .filter(({ section }) => section.linear !== 'no')
  if (!needsSpineToc(entries, linear.length)) return { entries, notes }

  const spine: SpineSection[] = []
  for (const { section, index } of linear) {
    if (cancelled()) return { entries, notes }
    let summary = null
    try {
      summary = describeSection(await section.createDocument())
    } catch {
      // Section illisible : elle garde une entrée générique.
    }
    spine.push({ index, href: section.id, summary })
    await idle()
  }

  const hasMarks = spine.some((s) => s.summary?.marks.length)
  const CFI = hasMarks ? await import('~/vendor/foliate-js/epubcfi.js') : null
  const markHref = (section: SpineSection, mark: SectionMark) => {
    if (mark.element.id) return `${section.href}#${mark.element.id}`
    const range = mark.element.ownerDocument.createRange()
    range.setStart(mark.element, 0)
    range.collapse(true)
    const base = book.sections[section.index]?.cfi ?? CFI!.fake.fromIndex(section.index)
    return CFI!.joinIndir(base, CFI!.fromRange(range))
  }

  const rebuilt = buildSpineToc(spine, {
    bookTitle: bookTitle(book),
    noteHrefs: new Set(notes.map((n) => hrefPath(n.href))),
    coverHrefs: new Set(
      (book.landmarks ?? [])
        .filter((l) => l.href && l.type?.some((t) => COVER_LANDMARKS.includes(t)))
        .map((l) => hrefPath(l.href!)),
    ),
    notesLabel: labels.notes,
    sectionLabel: labels.section,
    markHref,
  })
  return { entries: rebuilt.length ? rebuilt : entries, notes }
}

/**
 * Sommaire du livre ouvert dans le lecteur EPUB. `load` rend la main tout de suite : le sommaire
 * de foliate (notes à part) d'abord, puis, si besoin, celui reconstruit depuis le spine
 * (`building` pendant ce temps).
 */
export function useEpubToc() {
  const { t } = useI18n()
  const toc = shallowRef<ReaderToc>({ entries: [], notes: [] })
  const building = ref(false)
  let run = 0
  // Module CFI de foliate, pour situer exactement les intitulés repérés au milieu d'une section.
  let cfi: typeof import('~/vendor/foliate-js/epubcfi.js') | null = null

  async function load(book: FoliateBook): Promise<void> {
    const current = ++run
    const first = splitToc(book.toc)
    toc.value = first
    building.value = needsSpineToc(first.entries, book.sections.length)
    try {
      const full = await loadEpubToc(
        book,
        { notes: t('reader.toc.notes'), section: (n) => t('reader.toc.section', { n }) },
        () => current !== run,
      )
      if (full.entries.some((e) => e.offset)) {
        cfi ??= await import('~/vendor/foliate-js/epubcfi.js')
      }
      if (current === run) toc.value = full
    } catch {
      // Le sommaire de foliate reste affiché.
    } finally {
      if (current === run) building.value = false
    }
  }

  /** Entrée du sommaire à une position rapportée par foliate (`relocate`). */
  function locate(
    detail: Pick<FoliateRelocateDetail, 'cfi' | 'fraction' | 'section' | 'tocItem'>,
    sectionFractions: readonly number[],
  ): ReaderTocEntry | null {
    const index = detail.section?.current ?? -1
    // Fin de la page affichée : un intitulé visible sur la page en fait le chapitre courant.
    const pageEnd = cfi && detail.cfi ? cfi.collapse(detail.cfi, true) : null
    return currentTocEntry(toc.value.entries, {
      index,
      offset: fractionInSection(detail.fraction ?? 0, index, sectionFractions),
      href: detail.tocItem?.href,
      reached: (entry) =>
        pageEnd && cfi!.isCFI.test(entry.href) ? cfi!.compare(entry.href, pageEnd) <= 0 : undefined,
    })
  }

  /** Abandonne la reconstruction en cours (livre refermé). */
  function cancel(): void {
    run++
  }

  return {
    entries: computed(() => toc.value.entries),
    notes: computed(() => toc.value.notes),
    building: readonly(building),
    load,
    locate,
    cancel,
  }
}
