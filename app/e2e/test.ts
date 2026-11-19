import { mkdir, mkdtemp, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test as base, type BrowserContext } from '@playwright/test'

const LOCK = join(tmpdir(), 'torgas-e2e-webkit.lock')
const LOCK_STALE_MS = 3 * 60_000

/** Verrou inter-processus (un dossier) : un seul test WebKit à la fois, voir ci-dessous. */
async function acquireLock(): Promise<void> {
  for (;;) {
    try {
      await mkdir(LOCK)
      return
    } catch {
      // Verrou resté après un arrêt brutal : on le reprend passé un délai.
      const age = await stat(LOCK).then(
        (s) => Date.now() - s.mtimeMs,
        () => 0,
      )
      if (age > LOCK_STALE_MS) await rm(LOCK, { recursive: true, force: true })
      await new Promise((resolve) => setTimeout(resolve, 200))
    }
  }
}

/** Vide l'OPFS de l'origine de l'app (page jetable : aucun worker n'y tient de fichier ouvert). */
async function wipeOpfs(context: BrowserContext, baseURL: string): Promise<void> {
  const page = await context.newPage()
  await page.goto(new URL('/robots.txt', baseURL).href)
  await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory()
    for await (const name of root.keys()) await root.removeEntry(name, { recursive: true })
  })
  await page.close()
}

/**
 * `test` de Playwright, avec un contexte WebKit adapté à l'OPFS.
 *
 * Les contextes éphémères de Playwright (`browser.newContext()`) se comportent comme la navigation
 * privée de Safari : `navigator.storage.getDirectory()` (OPFS) y échoue avec une `UnknownError`,
 * donc le cœur web ne démarre pas. WebKit utilise donc un profil sur disque, comme un Safari normal.
 * Mais son stockage est partagé entre tous les contextes persistants du même moteur : pour garder
 * « un contexte neuf par test », les tests WebKit s'exécutent l'un après l'autre (verrou) et
 * l'OPFS est vidé avant chacun. Chromium et Firefox gardent un contexte éphémère par test.
 */
export const test = base.extend({
  context: [
    async (
      { playwright, browserName, browser, baseURL, locale, viewport, userAgent, colorScheme },
      use,
    ) => {
      const options = { baseURL, locale, viewport, userAgent, colorScheme }
      if (browserName !== 'webkit') {
        const context = await browser.newContext(options)
        await use(context)
        await context.close()
        return
      }
      await acquireLock()
      const profile = await mkdtemp(join(tmpdir(), 'torgas-e2e-webkit-'))
      try {
        const context = await playwright.webkit.launchPersistentContext(profile, options)
        await wipeOpfs(context, baseURL!)
        await use(context)
        await context.close()
      } finally {
        await rm(profile, { recursive: true, force: true })
        await rm(LOCK, { recursive: true, force: true })
      }
    },
    { scope: 'test', timeout: 180_000 },
  ],
})

export { expect }
