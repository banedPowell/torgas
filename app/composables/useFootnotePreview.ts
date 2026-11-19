import type { FoliateLinkDetail, View } from '~/vendor/foliate-js/view.js'

/** Délai de survol avant d'afficher la note, et délai de grâce avant de la masquer. */
export const FOOTNOTE_OPEN_DELAY = 250
export const FOOTNOTE_CLOSE_DELAY = 300

/** Rectangle de l'appel de note, en pixels, relatif à l'élément `bounds`. */
export interface FootnoteAnchor {
  x: number
  y: number
  width: number
  height: number
}

export interface FootnotePreview {
  /** Numéro de l'appel (« 1 » pour « [1] »), vide s'il n'y en a pas. */
  label: string
  text: string
  /** Cible de la note (lien résolu), pour « Aller à la note ». */
  href: string
  anchor: FootnoteAnchor
  /** Ouverte par un clic, un tap ou Entrée : reste affichée jusqu'à Échap ou un autre tap. */
  pinned: boolean
  /** Ouverte au clavier : la bulle prend le focus. */
  keyboard: boolean
}

/**
 * Aperçu des notes de bas de page de l'EPUB : survol (souris) ou focus d'un appel de note →
 * bulle temporaire ; clic, tap ou Entrée → bulle épinglée, sans naviguer. La navigation vers
 * la note reste possible (`goToNote`).
 */
export function useFootnotePreview(options: {
  view: () => View | null
  /** Élément de référence des coordonnées de la bulle (le lecteur). */
  bounds: () => HTMLElement | null
}) {
  const note = shallowRef<FootnotePreview | null>(null)
  const sections = new WeakMap<Document, number>()
  const documents = new Map<number, Promise<Document | null>>()
  let current: HTMLAnchorElement | null = null
  let request = 0
  let pinned = false
  let keyboardClick = false
  let ignoreFocus = false
  let openTimer: ReturnType<typeof setTimeout> | undefined
  let closeTimer: ReturnType<typeof setTimeout> | undefined

  function clearTimers() {
    clearTimeout(openTimer)
    clearTimeout(closeTimer)
  }
  onScopeDispose(clearTimers)

  function referenceOf(target: EventTarget | null): HTMLAnchorElement | null {
    const a = (target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null
    return a && isFootnoteReference(a) ? a : null
  }

  function sectionDocument(index: number): Promise<Document | null> {
    let doc = documents.get(index)
    if (!doc) {
      const section = options.view()?.book.sections[index]
      doc = Promise.resolve(section?.createDocument?.() ?? null).catch(() => null)
      documents.set(index, doc)
    }
    return doc
  }

  /** Lien de l'appel résolu depuis la racine de l'archive (comme l'événement `link`). */
  function resolveHref(a: HTMLAnchorElement): string | null {
    const raw = a.getAttribute('href')
    const index = sections.get(a.ownerDocument)
    const section = index === undefined ? null : options.view()?.book.sections[index]
    return raw ? (section?.resolveHref?.(raw) ?? raw) : null
  }

  async function loadText(href: string, refId: string | null): Promise<string | null> {
    const book = options.view()?.book
    const fragment = linkFragment(href)
    const target = book?.resolveHref?.(href)
    if (!fragment || !target || target.index < 0) return null
    const doc = await sectionDocument(target.index)
    return doc ? extractFootnote(doc, fragment, refId) : null
  }

  function anchorOf(a: HTMLAnchorElement): FootnoteAnchor {
    const rect = a.getClientRects()[0] ?? a.getBoundingClientRect()
    const frame = a.ownerDocument.defaultView?.frameElement?.getBoundingClientRect()
    const base = options.bounds()?.getBoundingClientRect()
    return {
      x: rect.left + (frame?.left ?? 0) - (base?.left ?? 0),
      y: rect.top + (frame?.top ?? 0) - (base?.top ?? 0),
      width: rect.width,
      height: rect.height,
    }
  }

  /** Position de l'appel, ou `null` s'il n'est plus à l'écran (page tournée). */
  function visibleAnchor(a: HTMLAnchorElement): FootnoteAnchor | null {
    const box = options.bounds()?.getBoundingClientRect()
    if (!a.isConnected || !box) return null
    const anchor = anchorOf(a)
    const visible =
      anchor.x + anchor.width > 0 &&
      anchor.x < box.width &&
      anchor.y + anchor.height > 0 &&
      anchor.y < box.height
    return visible ? anchor : null
  }

  async function show(a: HTMLAnchorElement, opts: { pin: boolean; href?: string | null }) {
    clearTimers()
    const href = opts.href ?? resolveHref(a)
    if (!href) return
    const id = ++request
    const keyboard = opts.pin && keyboardClick
    current = a
    pinned = opts.pin
    const text = await loadText(href, a.getAttribute('id') || a.getAttribute('name'))
    if (id !== request) return
    if (!text) {
      // Cible introuvable ou vide : un clic garde la navigation habituelle.
      if (opts.pin) void options.view()?.goTo(href)
      return
    }
    const anchor = visibleAnchor(a)
    if (!anchor) return close()
    const label = (a.textContent ?? '').replace(/[\s[\]()]/g, '')
    note.value = { label, text, href, anchor, pinned: opts.pin, keyboard }
  }

  function close() {
    clearTimers()
    request++
    pinned = false
    note.value = null
  }

  /** Échap ou tap ailleurs : ferme la bulle. Renvoie `true` si elle était ouverte. */
  function dismiss(): boolean {
    const open = note.value
    close()
    if (!open) return false
    if (open.keyboard && current) {
      ignoreFocus = true
      current.focus({ preventScroll: true })
      ignoreFocus = false
    }
    return true
  }

  /** Masque la bulle après un court délai (le pointeur peut rejoindre la bulle). */
  function scheduleClose() {
    clearTimeout(openTimer)
    if (pinned) return
    clearTimeout(closeTimer)
    closeTimer = setTimeout(close, FOOTNOTE_CLOSE_DELAY)
  }

  function keepOpen() {
    clearTimeout(closeTimer)
  }

  function goToNote() {
    const href = note.value?.href
    close()
    if (href) void options.view()?.goTo(href)
  }

  /** Branche les appels de note d'une section chargée (iframe foliate). */
  function listen(doc: Document, index: number) {
    sections.set(doc, index)
    doc.addEventListener('pointerover', (e) => {
      const a = e.pointerType === 'mouse' ? referenceOf(e.target) : null
      if (!a || pinned) return
      clearTimers()
      if (a === current && note.value) return
      openTimer = setTimeout(() => void show(a, { pin: false }), FOOTNOTE_OPEN_DELAY)
    })
    doc.addEventListener('pointerout', (e) => {
      if (e.pointerType === 'mouse' && referenceOf(e.target)) scheduleClose()
    })
    doc.addEventListener('focusin', (e) => {
      const a = referenceOf(e.target)
      if (a && !ignoreFocus && !pinned) void show(a, { pin: false })
    })
    doc.addEventListener('focusout', (e) => referenceOf(e.target) && scheduleClose())
    // `detail === 0` : clic produit par Entrée sur le lien (clavier).
    doc.addEventListener('click', (e) => (keyboardClick = e.detail === 0), true)
  }

  /** Clic ou tap sur un lien du livre : un appel de note ouvre la bulle au lieu de naviguer. */
  function onLink(e: Event) {
    const { a, href } = (e as CustomEvent<FoliateLinkDetail>).detail
    if (!isFootnoteReference(a)) return close()
    e.preventDefault()
    if (note.value?.pinned && current === a) close()
    else void show(a, { pin: true, href })
  }

  /**
   * La page a bougé (page tournée, focus, mise en page) : la bulle suit l'appel s'il est encore
   * à l'écran, sinon elle se ferme.
   */
  function onRelocate() {
    const open = note.value
    if (!open || !current) return
    const anchor = visibleAnchor(current)
    if (anchor) note.value = { ...open, anchor }
    else close()
  }

  /** Branche la vue foliate : liens cliqués, et page qui bouge. */
  function attach(view: View) {
    view.addEventListener('link', onLink)
    view.addEventListener('relocate', onRelocate)
  }

  return { note: readonly(note), attach, listen, dismiss, close, scheduleClose, keepOpen, goToNote }
}
