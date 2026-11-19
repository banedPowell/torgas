import { expect, test } from './test'
import { makeAnnaCbz, makeKindleMangaEpub } from './fixtures'
import { importFile, openLibrary } from './helpers'

test.describe('Manga au format EPUB', () => {
  test("range l'EPUB Kindle avec le CBZ de la même série et conseille le CBZ", async ({ page }) => {
    await openLibrary(page)
    for (const file of [makeAnnaCbz(), makeKindleMangaEpub()]) {
      await importFile(page, file)
      await expect(page.getByRole('status', { name: 'Chargement de la bibliothèque' })).toBeHidden()
    }

    // Une seule carte : la série « One Piece », tome 13 (CBZ) et volume 67 (EPUB).
    const series = page.getByRole('link', { name: /^Couverture de One Piece / })
    await expect(series).toHaveCount(1)
    await expect(series).toContainText('0 / 2 vol.')
    await series.click()

    await expect(page.getByRole('heading', { level: 1, name: 'One Piece' })).toBeVisible()
    await expect(page.getByText('Cette série contient des EPUB')).toBeVisible()
    await expect(page.getByText(/Le CBZ est plus adapté aux mangas/)).toBeVisible()
    await expect(page.getByRole('link', { name: /^Volume 13 · / })).toBeVisible()
    const volume67 = page.getByRole('link', { name: /^Volume 67 · / })
    await expect(volume67).toBeVisible()

    // Le volume EPUB s'ouvre dans le lecteur de livres.
    await volume67.click()
    await expect(page).toHaveURL(/\/read\//)
    await expect(page.getByRole('status', { name: 'Ouverture du livre' })).toBeHidden()
    await expect(page.getByText('Œuvre introuvable')).toBeHidden()
  })
})
