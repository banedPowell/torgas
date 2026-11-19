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

function paragraph(chapter: number, index: number): string {
  return `<p>${SENTENCE} Chapitre ${chapter + 1}, paragraphe ${index + 1} : ${SENTENCE}</p>`
}

function chapterXhtml(chapter: number): string {
  const body = Array.from({ length: 40 }, (_, i) => paragraph(chapter, i)).join('\n')
  return `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="fr" lang="fr">
<head><meta charset="utf-8"/><title>${EPUB_CHAPTERS[chapter]}</title></head>
<body>
<h1>${EPUB_CHAPTERS[chapter]}</h1>
${body}
</body>
</html>`
}

/** EPUB 3 minimal : 3 chapitres de 40 paragraphes, sommaire (nav) et pas de couverture. */
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

/** CBZ de 6 pages PNG (`page-01.png`…), chacune d'une couleur distincte. */
export function makeCbz(): Fixture {
  const files: Zippable = {}
  for (let i = 0; i < CBZ_PAGES; i++) {
    const shade = 40 + i * 35
    const png = makePng([shade, 255 - shade, (shade * 3) % 256])
    files[`page-${String(i + 1).padStart(2, '0')}.png`] = [png, { level: 0 }]
  }
  return {
    name: `${CBZ_TITLE}.cbz`,
    mimeType: 'application/vnd.comicbook+zip',
    buffer: Buffer.from(zipSync(files)),
  }
}
