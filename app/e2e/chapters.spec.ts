import { expect, test } from './test'
import { CBZ_PAGES, makeCbz } from './fixtures'
import { importFile, openLibrary } from './helpers'

test.describe('Manga : volumes et chapitres', () => {
  test.use({ viewport: { width: 800, height: 1000 } })

  test('bascule sur les chapitres, cherche et enchaîne le chapitre suivant', async ({ page }) => {
    await openLibrary(page)
    const files = [
      makeCbz('Saga v01.cbz', 0),
      makeCbz('Saga - Chapitre 11.cbz', 10),
      makeCbz('Saga - Chapitre 12 - Le retour.cbz', 20),
      makeCbz('Saga c14.cbz', 30),
    ]
    for (const file of files) {
      await importFile(page, file)
      await expect(page.getByRole('status', { name: 'Chargement de la bibliothèque' })).toBeHidden()
    }

    // Une seule carte pour la série, qui compte volumes et chapitres.
    const series = page.getByRole('link', { name: /^Couverture de Saga CBZ/ })
    await expect(series).toHaveCount(1)
    await expect(series).toContainText('0 / 1 vol. · 0 / 3 chap.')
    await series.click()

    // Rien de lu : la fiche s'ouvre sur les volumes ; la bascule mène aux chapitres.
    await expect(page.getByRole('link', { name: 'Lire le volume 1' })).toBeVisible()
    await page.getByRole('tab', { name: /^Chapitres/ }).click()
    const list = page.getByRole('list', { name: 'Chapitres' })
    await expect(list.getByRole('link')).toHaveCount(3)
    await expect(list.getByText('Le retour')).toBeVisible()
    await expect(list.getByText('Prochain chapitre')).toBeVisible()
    await expect(page.getByText('Chapitre manquant : 13')).toBeVisible()

    // Recherche par numéro, puis par titre.
    const search = page.getByRole('searchbox', { name: 'Rechercher un chapitre' })
    await search.fill('12')
    await expect(list.getByRole('link')).toHaveCount(1)
    await expect(list.getByText('Le retour')).toBeVisible()
    await search.fill('retour')
    await expect(list.getByRole('link')).toHaveCount(1)
    await search.fill('99')
    await expect(page.getByText('Aucun chapitre ne correspond à « 99 ».')).toBeVisible()
    await page.getByRole('button', { name: 'Effacer la recherche' }).click()
    await expect(list.getByRole('link')).toHaveCount(3)

    // Lecture du chapitre 11 jusqu'au bout, puis le chapitre suivant.
    await page.getByRole('link', { name: 'Lire le chapitre 11' }).click()
    await expect(page.getByRole('img', { name: `Page 1 sur ${CBZ_PAGES}` })).toBeVisible()
    await expect(page.getByText('Saga · ch. 11')).toBeVisible()
    const chapter11 = page.url()
    for (let n = 2; n <= CBZ_PAGES; n++) {
      await page.keyboard.press('ArrowRight')
      await expect(page.getByRole('img', { name: `Page ${n} sur ${CBZ_PAGES}` })).toBeVisible()
    }
    await page.keyboard.press('ArrowRight')
    await expect(page.getByRole('heading', { name: 'À suivre : chapitre 12' })).toBeVisible()
    await page.getByRole('link', { name: 'Chapitre suivant' }).click()
    await expect(page).not.toHaveURL(chapter11)
    await expect(page.getByRole('img', { name: `Page 1 sur ${CBZ_PAGES}` })).toBeVisible()
    await expect(page.getByText('Saga · ch. 12')).toBeVisible()
    // Une page tournée : le chapitre 12 est en cours (la barre « Reprendre » le proposera).
    await page.keyboard.press('ArrowRight')
    await expect(page.getByRole('img', { name: `Page 2 sur ${CBZ_PAGES}` })).toBeVisible()

    // Retour à la fiche : elle rouvre les chapitres (dernière lecture), le 11 est lu.
    await page.getByRole('button', { name: 'Fermer le lecteur' }).click()
    await expect(page).toHaveURL(/\/works\//)
    await expect(page.getByRole('link', { name: /^Chapitre 11 · Lu$/ })).toBeVisible()
    await expect(page.getByRole('link', { name: /^(Lire|Reprendre) le chapitre 12/ })).toBeVisible()

    // La barre « Reprendre » nomme le chapitre par sa série, pas par son nom de fichier.
    await page.getByRole('link', { name: 'Bibliothèque' }).first().click()
    const resume = page.getByRole('complementary', { name: 'Reprendre' })
    await expect(resume).toContainText('Saga · ch. 12')
  })
})

test.describe('Manga : longue liste de chapitres', () => {
  test.use({ viewport: { width: 800, height: 900 } })

  test('virtualise la liste dans le défilement de la page, sans cadre à part', async ({ page }) => {
    test.setTimeout(300_000)
    await openLibrary(page)
    const count = 230
    await page.getByRole('button', { name: 'Importer des œuvres', exact: true }).click()
    const panel = page.getByRole('dialog', { name: 'Import' })
    const chooser = page.waitForEvent('filechooser')
    await panel.getByRole('button', { name: /Dépose tes fichiers ici/ }).click()
    await (
      await chooser
    ).setFiles(
      Array.from({ length: count }, (_, i) => {
        const file = makeCbz(`Long - Chapitre ${i + 1}.cbz`, 0, i)
        return { name: file.name, mimeType: file.mimeType, buffer: file.buffer }
      }),
    )
    await expect(panel.getByRole('button', { name: /Annuler/ })).toBeHidden({ timeout: 150_000 })
    await page.keyboard.press('Escape')

    await page.getByRole('link', { name: /^Couverture de Long/ }).click()
    // Que des chapitres : pas de bascule, la liste s'affiche d'emblée.
    const list = page.getByRole('list', { name: 'Chapitres' })
    await expect(list.getByRole('link', { name: /^Chapitre 1 ·/ })).toBeVisible()
    // Une fenêtre de lignes seulement, et la liste ne défile pas seule.
    expect(await list.locator('li').count()).toBeLessThan(80)
    expect(await list.evaluate((el) => getComputedStyle(el.parentElement!).overflowY)).not.toBe(
      'auto',
    )

    // Défiler la page amène les derniers chapitres.
    await page.mouse.move(400, 500)
    for (let i = 0; i < 40; i++) await page.mouse.wheel(0, 600)
    await expect(list.getByRole('link', { name: new RegExp(`^Chapitre ${count} ·`) })).toBeVisible()

    // La confirmation de suppression parle de chapitres.
    await page.getByRole('button', { name: "Plus d'actions" }).click()
    await page.getByRole('menuitem', { name: 'Supprimer de la bibliothèque' }).click()
    await expect(page.getByText(`Les ${count} chapitres de la série`)).toBeVisible()
  })
})
