import { expect, test } from './test'
import {
  CBZ_PAGES,
  CBZ_TITLE,
  EPUB_CHAPTERS,
  EPUB_FOOTNOTE,
  EPUB_TITLE,
  makeCbz,
  makeEpub,
} from './fixtures'
import { bookFrame, importFile, openFromLibrary, openLibrary, waitForBook } from './helpers'

const epub = makeEpub()

test.describe('Lecteur EPUB : notes et barre', () => {
  test.beforeEach(async ({ page }) => {
    await openLibrary(page)
    await importFile(page, epub)
    await openFromLibrary(page, EPUB_TITLE)
    await waitForBook(page, EPUB_CHAPTERS[0]!)
    // La barre se masque seule : elle ne recouvre plus le texte.
    await expect(page.getByRole('slider', { name: "Position dans l'œuvre" })).toBeHidden()
  })

  test('affiche une note au survol et au clic sans quitter la page (#41)', async ({ page }) => {
    const note = page.getByRole('dialog', { name: 'Note 1' })
    const ref = bookFrame(page)!.locator('#_ftnref1')

    await ref.hover()
    await expect(note).toContainText(EPUB_FOOTNOTE)
    await page.mouse.move(640, 700)
    await expect(note).toBeHidden()

    // Le clic épingle la bulle au lieu de naviguer ; Échap la ferme sans quitter le lecteur.
    await ref.click()
    await expect(note).toContainText(EPUB_FOOTNOTE)
    await page.keyboard.press('Escape')
    await expect(note).toBeHidden()
    await expect(page).toHaveURL(/\/read\//)
    expect(await bookFrame(page)!.locator('#_ftnref1').count()).toBe(1)

    // « Aller à la note » garde la navigation : on arrive au chapitre de la note.
    await ref.click()
    await note.getByRole('button', { name: 'Aller à la note' }).click()
    await expect(note).toBeHidden()
    await expect
      .poll(() =>
        Promise.all(
          page.frames().map((f) =>
            // Frame détachée pendant le changement de section : « pas encore ».
            f
              .getByRole('heading', { name: EPUB_CHAPTERS[2] })
              .count()
              .catch(() => 0),
          ),
        ).then((counts) => counts.some((n) => n > 0)),
      )
      .toBe(true)
  })

  test('un tap dans la bande du haut affiche la barre sans tourner la page (#44)', async ({
    page,
  }) => {
    const location = () =>
      page.evaluate(
        () =>
          (document.querySelector('foliate-view') as { lastLocation?: { cfi: string } })
            ?.lastLocation?.cfi,
      )
    const before = await location()
    // Coin supérieur droit : en milieu d'écran, ce côté tournerait la page.
    await page.mouse.click(1200, 120)
    await expect(page.getByRole('slider', { name: "Position dans l'œuvre" })).toBeVisible()
    await page.waitForTimeout(500)
    expect(await location()).toBe(before)
  })
})

test.describe('Trackpad : glissement horizontal', () => {
  test.use({ viewport: { width: 800, height: 1000 } })

  test('une planche par geste, dans les deux sens', async ({ page }) => {
    await openLibrary(page)
    await importFile(page, makeCbz())
    await openFromLibrary(page, CBZ_TITLE)
    await expect(page.getByRole('img', { name: `Page 1 sur ${CBZ_PAGES}` })).toBeVisible()

    // Un geste = une rafale d'événements wheel (inertie comprise) : une seule page tournée.
    await page.mouse.move(400, 600)
    for (let i = 0; i < 8; i++) await page.mouse.wheel(30, 0)
    await expect(page.getByRole('img', { name: `Page 2 sur ${CBZ_PAGES}` })).toBeVisible()
    await expect(page.getByRole('img', { name: `Page 3 sur ${CBZ_PAGES}` })).toBeHidden()

    await page.waitForTimeout(400)
    for (let i = 0; i < 8; i++) await page.mouse.wheel(-30, 0)
    await expect(page.getByRole('img', { name: `Page 1 sur ${CBZ_PAGES}` })).toBeVisible()
  })

  test('tourne la page du livre EPUB', async ({ page }) => {
    await openLibrary(page)
    await importFile(page, epub)
    await openFromLibrary(page, EPUB_TITLE)
    await waitForBook(page, EPUB_CHAPTERS[0]!)
    const progress = page.locator('[aria-hidden="true"]').filter({ hasText: /^\d+\s%$/ })
    const before = await progress.innerText()

    await page.mouse.move(640, 500)
    for (let i = 0; i < 8; i++) await page.mouse.wheel(30, 0)
    await expect(progress).not.toHaveText(before)
  })
})
