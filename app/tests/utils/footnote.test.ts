import { describe, expect, it } from 'vitest'
import { extractFootnote, isFootnoteReference, linkFragment } from '~/utils/footnote'

function xhtml(body: string): Document {
  return new DOMParser().parseFromString(
    `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head><title>t</title></head><body>${body}</body></html>`,
    'application/xhtml+xml',
  )
}

function link(doc: Document): Element {
  return doc.querySelector('a')!
}

describe('linkFragment', () => {
  it('lit le fragment décodé', () => {
    expect(linkFragment('notes.xhtml#fn%201')).toBe('fn 1')
    expect(linkFragment('#_ftn1')).toBe('_ftn1')
    expect(linkFragment('notes.xhtml')).toBeNull()
    expect(linkFragment('notes.xhtml#')).toBeNull()
    expect(linkFragment(null)).toBeNull()
  })
})

describe('isFootnoteReference', () => {
  it('reconnaît le balisage sémantique', () => {
    expect(isFootnoteReference(link(xhtml('<a epub:type="noteref" href="n.xhtml#n1">1</a>')))).toBe(
      true,
    )
    expect(isFootnoteReference(link(xhtml('<a role="doc-noteref" href="#x">a</a>')))).toBe(true)
  })

  it('reconnaît les appels Word et Calibre', () => {
    const doc = xhtml(
      '<p>Texte<a href="Steinbeck_split_014.htm#_ftn1" name="_ftnref1" id="_ftnref1" class="calibre22"><span class="MsoFootnoteReference"><b>[1]</b></span></a>.</p>',
    )
    expect(isFootnoteReference(link(doc))).toBe(true)
    const byClass = xhtml('<a href="#x" class="MsoFootnoteReference">2</a>')
    expect(isFootnoteReference(link(byClass))).toBe(true)
  })

  it('reconnaît un court renvoi en exposant ou entre crochets', () => {
    expect(isFootnoteReference(link(xhtml('<sup><a href="#n3">3</a></sup>')))).toBe(true)
    expect(isFootnoteReference(link(xhtml('<a href="#n3"><sup>3</sup></a>')))).toBe(true)
    expect(isFootnoteReference(link(xhtml('<a href="#x">[12]</a>')))).toBe(true)
    expect(isFootnoteReference(link(xhtml('<a href="#fn4">4</a>')))).toBe(true)
  })

  it('ignore les liens ordinaires', () => {
    expect(isFootnoteReference(link(xhtml('<a href="c2.xhtml">Chapitre 2</a>')))).toBe(false)
    expect(isFootnoteReference(link(xhtml('<a href="c2.xhtml#p12">12</a>')))).toBe(false)
    expect(isFootnoteReference(link(xhtml('<a href="https://exemple.org">[1]</a>')))).toBe(false)
    expect(isFootnoteReference(link(xhtml('<a href="#sec">Voir plus loin</a>')))).toBe(false)
  })
})

describe('extractFootnote', () => {
  it('prend le paragraphe parent d’une ancre Word, sans le lien retour', () => {
    const doc = xhtml(`
<div id="ftn1">
<p class="MsoFootnoteText"><a href="Steinbeck_split_003.htm#_ftnref1" name="_ftn1" id="_ftn1"><span class="MsoFootnoteReference">[1]</span></a><span> </span><span>Traduit en français, sous le titre :
</span><i>Hivers sur la Colline</i>.</p>
</div>
<div id="ftn2"><p><a href="a.htm#_ftnref2" id="_ftn2">[2]</a> Autre note.</p></div>`)
    expect(extractFootnote(doc, '_ftn1', '_ftnref1')).toBe(
      'Traduit en français, sous le titre : Hivers sur la Colline.',
    )
    expect(extractFootnote(doc, '_ftn2')).toBe('Autre note.')
  })

  it('prend l’élément aside ou li visé', () => {
    const doc = xhtml(`
<aside epub:type="footnote" id="n1"><p>Première partie.</p><p>Seconde <em>partie</em>.</p></aside>
<ol><li id="n2"><p>Note de liste. <a href="c1.xhtml#r2" role="doc-backlink">↩</a></p></li></ol>`)
    expect(extractFootnote(doc, 'n1')).toBe('Première partie.\n\nSeconde partie.')
    expect(extractFootnote(doc, 'n2', 'r2')).toBe('Note de liste.')
  })

  it('remonte au conteneur de note depuis une ancre interne', () => {
    const doc = xhtml(
      '<section epub:type="footnotes"><div epub:type="endnote"><p><a id="e1"/>Texte de fin. <a href="#ref">↑</a></p></div></section>',
    )
    expect(extractFootnote(doc, 'e1')).toBe('Texte de fin.')
  })

  it('trouve une ancre nommée sans id', () => {
    const doc = xhtml('<p><a name="old1">1.</a> Ancienne note.</p>')
    expect(extractFootnote(doc, 'old1')).toBe('Ancienne note.')
  })

  it('renvoie null si la cible manque ou est vide', () => {
    const doc = xhtml('<p id="vide"><a href="#r1" id="vide-a">[1]</a></p>')
    expect(extractFootnote(doc, 'absente')).toBeNull()
    expect(extractFootnote(doc, 'vide', 'r1')).toBeNull()
  })
})
