import { expect, test } from './test'
import { CBZ_PAGES, CBZ_TITLE, EPUB_CHAPTERS, EPUB_TITLE, makeCbz, makeEpub } from './fixtures'
import {
  importFile,
  openFromLibrary,
  openLibrary,
  readerExactPercent,
  readerPercent,
  resumeLink,
  turnPage,
  waitForBook,
  workCard,
} from './helpers'

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
    const percent = await readerExactPercent(page)

    await page.getByRole('button', { name: 'Quitter le lecteur' }).click()
    await expect(page).toHaveURL(/\/works\//)

    // Dès le retour, la fiche affiche la progression enregistrée à la fermeture (#29).
    await resumeLink(page, percent).click()
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

    // Sans attendre la sauvegarde différée : la fermeture enregistre la position (#29, #30).
    await page.getByRole('button', { name: 'Fermer le lecteur' }).click()
    await expect(page).toHaveURL(/\/works\//)
    await expect(resumeLink(page, '67 %')).toBeVisible()

    // Rechargement complet aussitôt : la bibliothèque (OPFS + SQLite) et la position sont là.
    await page.reload()
    await expect(resumeLink(page, '67 %')).toBeVisible()
    await page.getByRole('link', { name: 'Retour à la bibliothèque' }).click()
    await expect(workCard(page, CBZ_TITLE)).toBeVisible()

    await openFromLibrary(page, CBZ_TITLE)
    await expect(page.getByRole('img', { name: `Page 4 sur ${CBZ_PAGES}` })).toBeVisible()
    await expect(page.getByText(`4 / ${CBZ_PAGES}`)).toBeVisible()
  })

  test('recharger pendant la lecture garde la dernière page', async ({ page }) => {
    await openLibrary(page)
    await importFile(page, cbz)
    await openFromLibrary(page, CBZ_TITLE)
    await expect(page.getByRole('img', { name: `Page 1 sur ${CBZ_PAGES}` })).toBeVisible()
    for (let n = 2; n <= 3; n++) {
      await page.keyboard.press('ArrowRight')
      await expect(page.getByRole('img', { name: `Page ${n} sur ${CBZ_PAGES}` })).toBeVisible()
    }

    // La page 3 n'est pas encore dans SQLite (sauvegarde différée) : la copie locale la garde.
    await page.reload()
    await expect(page.getByRole('img', { name: `Page 3 sur ${CBZ_PAGES}` })).toBeVisible()
    await page.getByRole('button', { name: 'Fermer le lecteur' }).click()
    await expect(resumeLink(page, '50 %')).toBeVisible()
  })
})

test.describe('CBZ : série en deux volumes', () => {
  test.use({ viewport: { width: 800, height: 1000 } })

  test('lit le volume 1 puis enchaîne sur le volume 2', async ({ page }) => {
    await openLibrary(page)
    await importFile(page, makeCbz('Saga v01.cbz', 0))
    await expect(page.getByRole('status', { name: 'Chargement de la bibliothèque' })).toBeHidden()
    await importFile(page, makeCbz('Saga v02.cbz', 20))

    // Les deux volumes sont regroupés sous une seule carte de série.
    const series = page.getByRole('link', { name: /^Couverture de Saga CBZ/ })
    await expect(series).toHaveCount(1)
    await series.click()
    await page.getByRole('link', { name: 'Lire le volume 1' }).click()
    await expect(page).toHaveURL(/\/read\//)
    const volume1 = page.url()

    // Le lecteur s'ouvre bien sur le volume (et non « Œuvre introuvable »).
    await expect(page.getByRole('img', { name: `Page 1 sur ${CBZ_PAGES}` })).toBeVisible()
    await expect(page.getByText('Œuvre introuvable')).toBeHidden()
    for (let n = 2; n <= CBZ_PAGES; n++) {
      await page.keyboard.press('ArrowRight')
      await expect(page.getByRole('img', { name: `Page ${n} sur ${CBZ_PAGES}` })).toBeVisible()
    }
    await page.keyboard.press('ArrowRight')
    await expect(page.getByRole('heading', { name: 'À suivre : volume 2' })).toBeVisible()

    await page.getByRole('link', { name: 'Volume suivant' }).click()
    await expect(page).not.toHaveURL(volume1)
    await expect(page).toHaveURL(/\/read\//)
    await expect(page.getByRole('img', { name: `Page 1 sur ${CBZ_PAGES}` })).toBeVisible()
    await expect(page.getByText('Saga · vol. 2')).toBeVisible()

    // Le volume 1 est enregistré comme terminé avant le changement de volume ; retour sur la fiche.
    await page.getByRole('button', { name: 'Fermer le lecteur' }).click()
    await expect(page).toHaveURL(/\/works\//)
    await expect(page.getByRole('link', { name: 'Volume 1 · Terminé' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Lire le volume 2' })).toBeVisible()
  })
})

test.describe('Supprimer un ouvrage', () => {
  test('supprime depuis la fiche puis réimporte sans doublon', async ({ page }) => {
    await openLibrary(page)
    await importFile(page, epub)
    await expect(workCard(page, EPUB_TITLE)).toBeVisible()

    await workCard(page, EPUB_TITLE).click()
    await expect(page).toHaveURL(/\/works\//)
    await page.getByRole('button', { name: "Plus d'actions" }).click()
    await page.getByRole('menuitem', { name: 'Supprimer de la bibliothèque' }).click()
    const dialog = page.getByRole('dialog', { name: `Supprimer « ${EPUB_TITLE} » ?` })
    await expect(dialog).toBeVisible()
    await expect(dialog.getByText('Ton temps de lecture reste acquis.')).toBeVisible()
    await dialog.getByRole('button', { name: 'Supprimer' }).click()

    // Retour à la bibliothèque, vide ; la suppression tient au rechargement (OPFS + SQLite).
    await expect(page).toHaveURL(/\/$/)
    await expect(page.getByText(`« ${EPUB_TITLE} » supprimé de la bibliothèque`)).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Ta bibliothèque est vide' })).toBeVisible()
    await page.reload()
    await expect(page.getByRole('heading', { name: 'Ta bibliothèque est vide' })).toBeVisible()

    await importFile(page, epub)
    await expect(workCard(page, EPUB_TITLE)).toBeVisible()
    await expect(page.getByText('déjà dans ta bibliothèque')).toBeHidden()
  })

  test('supprime une sélection depuis la bibliothèque', async ({ page }) => {
    await openLibrary(page)
    await importFile(page, epub)
    await expect(workCard(page, EPUB_TITLE)).toBeVisible()
    await importFile(page, cbz)
    await expect(workCard(page, CBZ_TITLE)).toBeVisible()

    await page.getByRole('button', { name: 'Sélectionner', exact: true }).click()
    await page.getByRole('checkbox', { name: `Sélectionner ${EPUB_TITLE}` }).click()
    await page.getByRole('checkbox', { name: `Sélectionner ${CBZ_TITLE}` }).click()
    const toolbar = page.getByRole('toolbar', { name: 'Actions sur la sélection' })
    await expect(toolbar.getByText('2 sélectionnés')).toBeVisible()
    await toolbar.getByRole('button', { name: 'Supprimer' }).click()

    const dialog = page.getByRole('dialog', { name: 'Supprimer 2 ouvrages ?' })
    await dialog.getByRole('button', { name: 'Supprimer les 2' }).click()
    await expect(page.getByText('2 ouvrages supprimés de la bibliothèque')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Ta bibliothèque est vide' })).toBeVisible()
    await expect(toolbar).toBeHidden()
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
