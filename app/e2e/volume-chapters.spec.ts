import { expect, test } from './test'
import { makeChapteredCbz } from './fixtures'
import { importFile, openLibrary } from './helpers'

test.describe('Série de volumes', () => {
  test.use({ viewport: { width: 1000, height: 1000 } })

  test('liste les chapitres contenus dans les volumes et supprime un volume seul', async ({
    page,
  }) => {
    await openLibrary(page)
    for (const file of [
      makeChapteredCbz('Saga T13.cbz', [109, 110, 111]),
      makeChapteredCbz('Saga T14.cbz', [112, 113]),
    ]) {
      await importFile(page, file)
      await expect(page.getByRole('status', { name: 'Chargement de la bibliothèque' })).toBeHidden()
    }
    await page.getByRole('link', { name: /^Couverture de Saga/ }).click()

    // Les volumes, puis les chapitres trouvés dans leurs pages, regroupés par volume.
    await expect(page.getByRole('link', { name: /^Volume 13 · CBZ · / })).toBeVisible()
    await page.getByRole('tab', { name: /^Chapitres/ }).click()
    const list = page.getByRole('list', { name: 'Chapitres' })
    await expect(list.getByRole('link')).toHaveCount(5)
    await expect(list.getByText('Volume 14')).toBeVisible()

    // Un chapitre ouvre son volume à sa première page.
    await list.getByRole('link', { name: /^Chapitre 110 · / }).click()
    await expect(page.getByRole('img', { name: 'Page 3 sur 6' })).toBeVisible()
    await page.getByRole('button', { name: 'Fermer le lecteur' }).click()
    await expect(page).toHaveURL(/\/works\//)

    // Supprimer le volume 14 seul : la série garde le volume 13.
    await page.getByRole('tab', { name: /^Volumes/ }).click()
    await page.getByRole('button', { name: 'Actions : Volume 14' }).click()
    await page.getByRole('menuitem', { name: 'Supprimer ce volume' }).click()
    const dialog = page.getByRole('dialog', { name: /Supprimer « Saga · vol\. 14 »/ })
    await expect(dialog).toContainText('Le reste de la série est gardé')
    await dialog.getByRole('button', { name: 'Supprimer', exact: true }).click()
    await expect(dialog).toBeHidden()
    await expect(page.getByRole('link', { name: /^Volume 14 · / })).toBeHidden()
    await expect(page.getByRole('link', { name: /^Volume 13 · CBZ · / })).toBeVisible()
    await expect(page).toHaveURL(/\/works\//)
  })
})
