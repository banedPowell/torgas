// Serveur statique minimal pour `.output/public` (build `nuxt generate`) : types MIME corrects
// (`.wasm`, modules, workers) et repli SPA vers `200.html` pour les routes (/works/…, /read/…).
import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { extname, join, normalize, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(new URL('../.output/public', import.meta.url)))
const port = Number(process.env.PORT ?? 4173)

const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
}

async function fileFor(pathname) {
  const path = normalize(join(root, decodeURIComponent(pathname)))
  if (path !== root && !path.startsWith(root + sep)) return null
  for (const candidate of [path, join(path, 'index.html')]) {
    const info = await stat(candidate).catch(() => null)
    if (info?.isFile()) return candidate
  }
  return null
}

createServer(async (req, res) => {
  try {
    const { pathname } = new URL(req.url ?? '/', 'http://localhost')
    let file = await fileFor(pathname)
    // Une ressource manquante (avec extension) est une vraie 404 ; une route passe par la SPA.
    if (!file && extname(pathname) === '') file = await fileFor('/200.html')
    if (!file) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('Introuvable')
      return
    }
    res.writeHead(200, {
      'content-type': types[extname(file)] ?? 'application/octet-stream',
      'cache-control': 'no-cache',
    })
    res.end(await readFile(file))
  } catch (error) {
    res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' }).end(String(error))
  }
}).listen(port, '127.0.0.1', () => console.log(`Torgas statique : http://127.0.0.1:${port}`))
