// Notes de bas de page des EPUB : reconnaître un appel de note et extraire le texte de la note.
// Fonctions pures sur le DOM (le document du livre, rendu par foliate-js dans une iframe).

const OPS_NS = 'http://www.idpf.org/2007/ops'

/** Jetons `epub:type` / `role` d'un appel de note. */
const NOTEREF_TYPES = ['noteref', 'doc-noteref']
/** Jetons `epub:type` / `role` d'une note (le conteneur à afficher). */
const NOTE_TYPES = ['footnote', 'endnote', 'rearnote', 'note', 'doc-footnote', 'doc-endnote']
/** Jetons `epub:type` / `role` d'un lien retour vers l'appel. */
const BACKLINK_TYPES = ['backlink', 'doc-backlink']
/** Éléments qui forment à eux seuls une note (liste de notes, encadré). */
const NOTE_CONTAINERS = new Set(['aside', 'li', 'dd'])
/** Blocs de texte : le paragraphe parent d'une ancre de note (notes Word, Calibre…). */
const BLOCKS = new Set(['p', 'div', 'li', 'dd', 'dt', 'td', 'blockquote', 'aside', 'section'])

/** Ancre cible d'une note dans le fichier Word/Calibre (`#_ftn1`, `#fn2`, `#note-3`…). */
const NOTE_FRAGMENT = /^_?(ftn|edn|fn|footnote|endnote|note|nt)[-_]?\d+$/i
/** Identifiant de l'appel lui-même (`_ftnref1`, `fnref2`…). */
const NOTEREF_ID = /^_?(ftn|edn|fn|footnote|endnote|note)[-_]?ref[-_]?\d+$/i
/** Classes Word des appels de note, conservées par Calibre. */
const MSO_REFERENCE = /\bMso(Foot|End)noteReference\b/
/** Texte d'un appel : « 1 », « [12] », « (3) », « * », « † »… */
const NOTEREF_TEXT = /^[[(]?(\d{1,3}|[*†‡§]{1,3}|[ivxlc]{1,5})[\])]?$/i
const BRACKETED = /^[[(]\s*\d{1,3}\s*[\])]$/
/** Liens retour sans rôle : « ↩ », « ↑ », « ^ », « retour ». */
const BACKLINK_TEXT = /^(↩︎?|↑|\^|retour|back)$/i

function tokens(el: Element): string[] {
  const type = el.getAttributeNS(OPS_NS, 'type') || el.getAttribute('epub:type') || ''
  const role = el.getAttribute('role') ?? ''
  return `${type} ${role}`.split(/\s+/).filter(Boolean)
}

function hasToken(el: Element, list: readonly string[]): boolean {
  return tokens(el).some((t) => list.includes(t))
}

function tagName(el: Element): string {
  return el.localName.toLowerCase()
}

/** Fragment (`#…`) d'un lien, sans le `#`, décodé. */
export function linkFragment(href: string | null | undefined): string | null {
  const index = href?.indexOf('#') ?? -1
  if (!href || index === -1 || index === href.length - 1) return null
  const fragment = href.slice(index + 1)
  try {
    return decodeURIComponent(fragment)
  } catch {
    return fragment
  }
}

function linkId(a: Element): string | null {
  return a.getAttribute('id') || a.getAttribute('name')
}

/**
 * Le lien est-il un appel de note ? Balisage sémantique (`epub:type="noteref"`,
 * `role="doc-noteref"`), appels Word/Calibre (`_ftnref1`, `MsoFootnoteReference`), ou court
 * renvoi en exposant (« ¹ », « [2] ») vers une ancre interne.
 */
export function isFootnoteReference(a: Element): boolean {
  const fragment = linkFragment(a.getAttribute('href'))
  if (!fragment) return false
  if (hasToken(a, NOTEREF_TYPES)) return true
  const id = linkId(a)
  if (id && NOTEREF_ID.test(id)) return true
  if (MSO_REFERENCE.test(a.getAttribute('class') ?? '')) return true
  if (a.querySelector('.MsoFootnoteReference, .MsoEndnoteReference')) return true
  const text = (a.textContent ?? '').replace(/\s+/g, '')
  if (!text || !NOTEREF_TEXT.test(text)) return false
  if (BRACKETED.test(text) || NOTE_FRAGMENT.test(fragment)) return true
  // Simple chiffre : seulement s'il est en exposant (sinon ce peut être un numéro de page d'index).
  const sup = (el: Element | null) =>
    !!el && (tagName(el) === 'sup' || getStyle(el)?.verticalAlign === 'super')
  return sup(a) || sup(a.parentElement) || !!a.querySelector('sup')
}

function getStyle(el: Element): CSSStyleDeclaration | null {
  try {
    return el.ownerDocument.defaultView?.getComputedStyle(el) ?? null
  } catch {
    return null
  }
}

/** Élément visé par un fragment : `id`, sinon ancre nommée (`<a name>`). */
function findTarget(doc: Document, id: string): Element | null {
  const byId = doc.getElementById(id)
  if (byId) return byId
  for (const el of doc.querySelectorAll('[name]')) if (el.getAttribute('name') === id) return el
  return null
}

/** Conteneur de la note : l'élément de note englobant, la cible si c'est un bloc, ou son bloc. */
function noteContainer(target: Element): Element | null {
  for (let el: Element | null = target; el; el = el.parentElement) {
    const name = tagName(el)
    if (name === 'body' || name === 'html') break
    if (hasToken(el, NOTE_TYPES) || NOTE_CONTAINERS.has(name)) return el
  }
  if (BLOCKS.has(tagName(target))) return target
  let block = target.parentElement
  while (block && !BLOCKS.has(tagName(block))) {
    if (['body', 'html'].includes(tagName(block))) return null
    block = block.parentElement
  }
  return block
}

function normalize(text: string | null): string {
  return (text ?? '').replace(/\s+/g, ' ').trim()
}

/**
 * Texte d'une note : `id` est l'ancre visée par l'appel (dans `doc`, le fichier de la note),
 * `refId` l'identifiant de l'appel (pour retirer le lien retour). Les paragraphes sont séparés
 * par une ligne vide. `null` si la cible est introuvable ou vide.
 */
export function extractFootnote(doc: Document, id: string, refId?: string | null): string | null {
  const target = findTarget(doc, id)
  if (!target) return null
  const container = noteContainer(target)
  if (!container) return null

  const clone = container.cloneNode(true) as Element
  const isBacklink = (a: Element) => {
    const fragment = linkFragment(a.getAttribute('href'))
    return (
      hasToken(a, BACKLINK_TYPES) ||
      (!!refId && fragment === refId) ||
      linkId(a) === id ||
      BACKLINK_TEXT.test(normalize(a.textContent))
    )
  }
  if (tagName(clone) === 'a' && isBacklink(clone)) return null
  for (const a of [...clone.querySelectorAll('a')]) if (isBacklink(a)) a.remove()
  for (const el of [...clone.querySelectorAll('script, style')]) el.remove()

  const paragraphs = [...clone.querySelectorAll('p')]
  const parts = (paragraphs.length ? paragraphs : [clone]).map((p) => normalize(p.textContent))
  const text = parts.filter(Boolean).join('\n\n')
  return text || null
}
