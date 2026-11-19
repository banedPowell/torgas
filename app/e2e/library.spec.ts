import { expect, test } from './test'
import { CBZ_PAGES, CBZ_TITLE, EPUB_CHAPTERS, EPUB_TITLE, makeCbz, makeEpub } from './fixtures'
import {
  importFile,
  openFromLibrary,
  openLibrary,
  readerPercent,
  turnPage,
  waitForBook,
  workCard,
} from './helpers'

/** Intervalle minimal entre deux sauvegardes de la position d'un CBZ (`useComicReader`). */
const COMIC_SAVE_INTERVAL = 2000

const epub = makeEpub()
const cbz = makeCbz()

test.describe('EPUB : importer, lire, rouvrir', () => {
  test("rouvre l'EPUB à la même position", async ({ page }) => {
    await openLibrary(page)
    await expect(page.getByRole('heading', { name: 'Ta bibliothèque est vide' })).toBeVisible()

    await importFile(page, epub)
    await expect(workCard(page, EPUB_TITLE)).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Ta bibliothèque est vide' })).toBeHidden()

    await openFromLibrary(page, EPUB_TITLE)
    await waitForBook(page, EPUB_CHAPTERS[0]!)
    const start = await readerPercent(page)

    for (let i = 0; i < 3; i++) await turnPage(page)

    // Un tap au centre ramène la barre : elle affiche la position et permet de quitter.
    await page.mouse.click(640, 400)
    const progress = page.getByRole('slider', { name: "Position dans l'œuvre" })
    await expect(progress).toBeVisible()
    const position = await progress.getAttribute('aria-valuetext')
    expect(position).not.toBe(start)

    await page.getByRole('button', { name: 'Quitter le lecteur' }).click()
    await expect(page).toHaveURL(/\/works\//)

    // Juste après la fermeture, la fiche peut encore afficher « Lire » : sa lecture de la
    // bibliothèque peut précéder l'écriture de la position (course observée, voir la PR).
    // Le lecteur, lui, relit la position enregistrée : c'est elle qu'on vérifie.
    await page.getByRole('link', { name: /^(Lire|Reprendre à)/ }).click()
    await expect(page).toHaveURL(/\/read\//)
    await expect.poll(() => readerPercent(page)).toBe(position)
  })

  test('signale un EPUB déjà dans la bibliothèque', async ({ page }) => {
    await openLibrary(page)
    await importFile(page, epub)
    await expect(workCard(page, EPUB_TITLE)).toBeVisible()

    await importFile(page, epub)
    await expect(page.getByText('déjà dans ta bibliothèque')).toBeVisible()
    await expect(workCard(page, EPUB_TITLE)).toHaveCount(1)
  })
})

test.describe('CBZ : importer, lire, recharger, rouvrir', () => {
  // Fenêtre en portrait : lecture en simple page (le mode automatique passe en double en paysage).
  test.use({ viewport: { width: 800, height: 1000 } })

  test('la bibliothèque et la page courante survivent au rechargement', async ({ page }) => {
    await openLibrary(page)
    await importFile(page, cbz)
    await expect(workCard(page, CBZ_TITLE)).toBeVisible()

    await openFromLibrary(page, CBZ_TITLE)
    await expect(page.getByRole('img', { name: `Page 1 sur ${CBZ_PAGES}` })).toBeVisible()
    for (let n = 2; n <= 4; n++) {
      await page.keyboard.press('ArrowRight')
      await expect(page.getByRole('img', { name: `Page ${n} sur ${CBZ_PAGES}` })).toBeVisible()
    }
    await expect(page.getByText(`4 / ${CBZ_PAGES}`)).toBeVisible()
    // La position est enregistrée au plus toutes les 2 s : on laisse passer la sauvegarde différée.
    await page.waitForTimeout(COMIC_SAVE_INTERVAL + 500)

    await page.getByRole('button', { name: 'Fermer le lecteur' }).click()
    await expect(page).toHaveURL(/\/works\//)

    // Rechargement complet du navigateur : la bibliothèque (OPFS + SQLite) est toujours là.
    await page.reload()
    await page.getByRole('link', { name: 'Retour à la bibliothèque' }).click()
    await expect(workCard(page, CBZ_TITLE)).toBeVisible()

    await openFromLibrary(page, CBZ_TITLE)
    await expect(page.getByRole('img', { name: `Page 4 sur ${CBZ_PAGES}` })).toBeVisible()
    await expect(page.getByText(`4 / ${CBZ_PAGES}`)).toBeVisible()
  })
})

test.describe('Thème sombre', () => {
  test("bascule en sombre dans l'app puis dans le lecteur", async ({ page }) => {
    await openLibrary(page)
    await importFile(page, epub)
    await expect(workCard(page, EPUB_TITLE)).toBeVisible()

    const html = page.locator('html')
    await expect(html).not.toHaveClass(/\bdark\b/)
    await page.getByRole('button', { name: 'Basculer le thème clair ou sombre' }).first().click()
    await expect(html).toHaveClass(/\bdark\b/)

    await openFromLibrary(page, EPUB_TITLE)
    await expect(page.locator('[data-reader-theme="dark"]').first()).toBeVisible()
    await expect(html).toHaveClass(/\bdark\b/)
  })
})
