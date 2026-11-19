import { crc32, deflateSync } from 'node:zlib'
import { strToU8, zipSync, type Zippable } from 'fflate'

/**
 * Livres de test générés à la volée : aucun contenu sous droits, aucun fichier binaire versionné.
 * Les textes sont du remplissage maison, assez longs pour s'étendre sur plusieurs pages.
 */

export interface Fixture {
  /** Nom du fichier importé (le titre de l'œuvre en découle pour un CBZ). */
  name: string
  mimeType: string
  buffer: Buffer
}

export const EPUB_TITLE = 'Le Voyage de test'
export const EPUB_AUTHOR = 'Autrice Fictive'
export const EPUB_CHAPTERS = ['Premier chapitre', 'Deuxième chapitre', 'Troisième chapitre']

export const CBZ_TITLE = 'Album de test'
export const CBZ_PAGES = 6

const SENTENCE =
  'Le vent léger traversait la plaine silencieuse tandis que les voyageurs cherchaient un abri pour la nuit, ' +
  'comptant les étoiles et rêvant du village qui les attendait au-delà de la colline.'

/** Texte de la note de bas de page, à la Word/Calibre : appel au chapitre 1, note au chapitre 3. */
export const EPUB_FOOTNOTE = 'Une note de bas de page rangée dans un autre fichier.'

const FOOTNOTE_REF =
  '<a href="c3.xhtml#_ftn1" id="_ftnref1"><span class="MsoFootnoteReference">[1]</span></a>'
const FOOTNOTE = `<div id="ftn1"><p><a href="c1.xhtml#_ftnref1" id="_ftn1">[1]</a> ${EPUB_FOOTNOTE}</p></div>`

function paragraph(chapter: number, index: number): string {
  const ref = chapter === 0 && index === 0 ? FOOTNOTE_REF : ''
  return `<p>${SENTENCE}${ref} Chapitre ${chapter + 1}, paragraphe ${index + 1} : ${SENTENCE}</p>`
}

function chapterXhtml(chapter: number): string {
  const paragraphs = Array.from({ length: 40 }, (_, i) => paragraph(chapter, i))
  const body = [...paragraphs, ...(chapter === 2 ? [FOOTNOTE] : [])].join('\n')
  return `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="fr" lang="fr">
<head><meta charset="utf-8"/><title>${EPUB_CHAPTERS[chapter]}</title></head>
<body>
<h1>${EPUB_CHAPTERS[chapter]}</h1>
${body}
</body>
</html>`
}

/**
 * EPUB 3 minimal : 3 chapitres de 40 paragraphes, une note de bas de page, sommaire (nav) et
 * pas de couverture.
 */
export function makeEpub(): Fixture {
  const files: Zippable = {
    // `mimetype` en premier et non compressé, comme l'exige la spécification EPUB.
    mimetype: [strToU8('application/epub+zip'), { level: 0 }],
    'META-INF/container.xml': strToU8(`<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>`),
    'OEBPS/content.opf': strToU8(`<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid" xml:lang="fr">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="uid">urn:uuid:5c1e0b6e-7a49-4b7d-9f27-0d4f4f3f3a11</dc:identifier>
    <dc:title>${EPUB_TITLE}</dc:title>
    <dc:creator>${EPUB_AUTHOR}</dc:creator>
    <dc:language>fr</dc:language>
    <meta property="dcterms:modified">2026-01-01T00:00:00Z</meta>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="c1" href="c1.xhtml" media-type="application/xhtml+xml"/>
    <item id="c2" href="c2.xhtml" media-type="application/xhtml+xml"/>
    <item id="c3" href="c3.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
  <spine><itemref idref="c1"/><itemref idref="c2"/><itemref idref="c3"/></spine>
</package>`),
    'OEBPS/nav.xhtml': strToU8(`<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="fr">
<head><meta charset="utf-8"/><title>Sommaire</title></head>
<body><nav epub:type="toc"><ol>
${EPUB_CHAPTERS.map((title, i) => `<li><a href="c${i + 1}.xhtml">${title}</a></li>`).join('\n')}
</ol></nav></body>
</html>`),
    'OEBPS/c1.xhtml': strToU8(chapterXhtml(0)),
    'OEBPS/c2.xhtml': strToU8(chapterXhtml(1)),
    'OEBPS/c3.xhtml': strToU8(chapterXhtml(2)),
  }
  return {
    name: 'voyage-de-test.epub',
    mimeType: 'application/epub+zip',
    buffer: Buffer.from(zipSync(files)),
  }
}

export const NOTES_EPUB_TITLE = 'Le Carnet annoté'
export const NOTES_EPUB_CHAPTERS = ['I', 'II', 'III']
export const NOTES_EPUB_NOTES = 3

/** Page XHTML façon conversion Word → Calibre : `<title>` identique partout, aucun h1-h6. */
function wordXhtml(body: string): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml">
<head><meta http-equiv="Content-Type" content="text/html; charset=utf-8"/><title>I</title></head>
<body><div><p> </p><p> </p>
${body}
</div></body>
</html>`
}

/**
 * EPUB 2 dont le sommaire (NCX) ne contient que les appels de notes (`[1]` → `notes.htm#_ftn1`),
 * comme certaines conversions Calibre : chapitres sans titre h1-h6, chaque intitulé (« I ») seul
 * dans son fichier avant celui du texte, page de titre en tête, notes à la fin.
 */
export function makeNotesOnlyEpub(): Fixture {
  const sections: [string, string][] = [
    ['title.htm', `<p>${EPUB_AUTHOR}</p><p>${NOTES_EPUB_TITLE}</p><p>Éditions de test</p>`],
  ]
  NOTES_EPUB_CHAPTERS.forEach((label, chapter) => {
    const call = `<a href="notes.htm#_ftn${chapter + 1}" id="_ftnref${chapter + 1}">[${chapter + 1}]</a>`
    const text = Array.from({ length: 40 }, (_, i) => paragraph(chapter, i)).join('\n')
    sections.push([`h${chapter + 1}.htm`, `<p>${label}</p>`])
    sections.push([`t${chapter + 1}.htm`, text.replace('</p>', `${call}</p>`)])
  })
  const notes = Array.from(
    { length: NOTES_EPUB_NOTES },
    (_, i) =>
      `<p id="_ftn${i + 1}"><a href="t${i + 1}.htm#_ftnref${i + 1}">[${i + 1}]</a> ${SENTENCE}</p>`,
  )
  sections.push(['notes.htm', notes.join('\n')])

  const files: Zippable = {
    mimetype: [strToU8('application/epub+zip'), { level: 0 }],
    'META-INF/container.xml': strToU8(`<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>`),
    'content.opf': strToU8(`<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="2.0" unique-identifier="uid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="uid">urn:uuid:9a7c2f3e-1b4d-4e8a-a0c5-6d2b8f1e7c40</dc:identifier>
    <dc:title>${NOTES_EPUB_TITLE}</dc:title>
    <dc:creator>${EPUB_AUTHOR}</dc:creator>
    <dc:language>fr</dc:language>
  </metadata>
  <manifest>
    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
${sections.map(([href], i) => `    <item id="s${i}" href="${href}" media-type="application/xhtml+xml"/>`).join('\n')}
  </manifest>
  <spine toc="ncx">${sections.map((_, i) => `<itemref idref="s${i}"/>`).join('')}</spine>
</package>`),
    'toc.ncx': strToU8(`<?xml version="1.0" encoding="utf-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head><meta name="dtb:uid" content="urn:uuid:9a7c2f3e-1b4d-4e8a-a0c5-6d2b8f1e7c40"/></head>
  <docTitle><text>${NOTES_EPUB_TITLE}</text></docTitle>
  <navMap>
${Array.from(
  { length: NOTES_EPUB_NOTES },
  (_, i) => `    <navPoint id="n${i + 1}" playOrder="${i + 1}">
      <navLabel><text>[${i + 1}]</text></navLabel><content src="notes.htm#_ftn${i + 1}"/>
    </navPoint>`,
).join('\n')}
  </navMap>
</ncx>`),
  }
  for (const [href, body] of sections) files[href] = strToU8(wordXhtml(body))
  return {
    name: 'carnet-annote.epub',
    mimeType: 'application/epub+zip',
    buffer: Buffer.from(zipSync(files)),
  }
}

function pngChunk(type: string, data: Buffer): Buffer {
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const checksum = Buffer.alloc(4)
  checksum.writeUInt32BE(crc32(body))
  return Buffer.concat([length, body, checksum])
}

/** PNG RVB uni de 64 × 96 pixels, valide (décodable par le navigateur et par le cœur). */
export function makePng(rgb: [number, number, number], width = 64, height = 96): Buffer {
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header.set([8, 2, 0, 0, 0], 8) // 8 bits, RVB, deflate, filtre 0, sans entrelacement
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array(width).fill(rgb).flat())])
  const raw = Buffer.concat(Array.from({ length: height }, () => row))
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0)),
  ])
}

/**
 * CBZ de 6 pages PNG (`page-01.png`…), chacune d'une couleur distincte. `tint` décale les
 * couleurs : deux CBZ de même nom de série mais de contenu différent (le doublon se détecte
 * par empreinte). `salt` ajoute un fichier texte (ignoré à la lecture) pour rendre l'archive
 * unique sans toucher aux pages.
 */
export function makeCbz(name = `${CBZ_TITLE}.cbz`, tint = 0, salt?: number): Fixture {
  const files: Zippable = {}
  if (salt !== undefined) files['notes.txt'] = strToU8(String(salt))
  for (let i = 0; i < CBZ_PAGES; i++) {
    const shade = 40 + i * 35 + tint
    const png = makePng([shade, 255 - shade, (shade * 3) % 256])
    files[`page-${String(i + 1).padStart(2, '0')}.png`] = [png, { level: 0 }]
  }
  return {
    name,
    mimeType: 'application/vnd.comicbook+zip',
    buffer: Buffer.from(zipSync(files)),
  }
}

/** Nom d'un CBZ d'Anna's Archive : segments ` -- `, tome `T013`, sans `ComicInfo.xml`. */
export const ANNA_CBZ_NAME =
  'One Piece T013 -- Eiichiro Oda -- 2014 -- Glénat Manga -- isbn13 9782331011634 -- ' +
  '084d0c76c3d6157912abf8e80f0c6bca -- Anna’s Archive.cbz'

/** CBZ façon scan d'éditeur (pages `109-00`…), de la même série que l'EPUB Kindle. */
export function makeAnnaCbz(): Fixture {
  const files: Zippable = {}
  for (let i = 0; i < 3; i++) {
    files[`109-${String(i).padStart(2, '0')}.png`] = [makePng([200, 40 + i * 50, 60]), { level: 0 }]
  }
  return {
    name: ANNA_CBZ_NAME,
    mimeType: 'application/vnd.comicbook+zip',
    buffer: Buffer.from(zipSync(files)),
  }
}

export const KINDLE_PAGES = [0, 1, 2]

/**
 * EPUB Kindle d'un manga (One Piece, Vol. 67) : `fixed-layout`, `book-type` comic, sujets
 * Manga, pages faites d'une image. Nom au format Anna's Archive.
 */
export function makeKindleMangaEpub(): Fixture {
  const manifest = KINDLE_PAGES.map(
    (n) =>
      `<item id="p${n}" href="p${n}.xhtml" media-type="application/xhtml+xml"/>` +
      `<item id="img${n}" href="images/p${n}.png" media-type="image/png"/>`,
  ).join('\n    ')
  const spine = KINDLE_PAGES.map((n) => `<itemref idref="p${n}"/>`).join('')
  const files: Zippable = {
    mimetype: [strToU8('application/epub+zip'), { level: 0 }],
    'META-INF/container.xml': strToU8(`<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>`),
    'OEBPS/content.opf': strToU8(`<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="2.0" unique-identifier="uid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:opf="http://www.idpf.org/2007/opf">
    <dc:identifier id="uid">urn:uuid:9a1e0b6e-7a49-4b7d-9f27-0d4f4f3f3a67</dc:identifier>
    <dc:title>One Piece, Vol. 67</dc:title>
    <dc:creator opf:role="aut">Eiichiro Oda</dc:creator>
    <dc:language>en</dc:language>
    <dc:subject>Manga</dc:subject>
    <dc:subject>Comics &amp; Graphic Novels</dc:subject>
    <meta name="fixed-layout" content="true"/>
    <meta name="book-type" content="comic"/>
    <meta name="cover" content="img0"/>
  </metadata>
  <manifest>
    ${manifest}
  </manifest>
  <spine page-progression-direction="rtl">${spine}</spine>
</package>`),
  }
  for (const n of KINDLE_PAGES) {
    files[`OEBPS/p${n}.xhtml`] = strToU8(`<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml"><head><title>${n}</title></head>
<body><div><img src="images/p${n}.png" alt=""/></div></body></html>`)
    files[`OEBPS/images/p${n}.png`] = [makePng([40, 80 + n * 40, 200]), { level: 0 }]
  }
  return {
    name:
      'One Piece, Vol_ 67 67 -- Oda, Eiichiro -- One Piece #67, 2013 -- VIZ Media LLC -- ' +
      '581d0c76c3d6157912abf8e80f0c6bca -- Anna’s Archive.epub',
    mimeType: 'application/epub+zip',
    buffer: Buffer.from(zipSync(files)),
  }
}
