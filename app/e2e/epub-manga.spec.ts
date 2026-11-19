import { expect, test } from './test'
import { KINDLE_PAGES, makeAnnaCbz, makeKindleMangaEpub } from './fixtures'
import { importFile, openLibrary } from './helpers'

test.describe('Manga au format EPUB', () => {
  test("range l'EPUB Kindle avec le CBZ de la même série et le lit en planches", async ({
    page,
  }) => {
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
    // Chaque tome affiche le format de son fichier.
    await expect(page.getByRole('link', { name: /^Volume 13 · CBZ · / })).toBeVisible()
    const volume67 = page.getByRole('link', { name: /^Volume 67 · EPUB · / })
    await expect(volume67).toBeVisible()

    // Le volume EPUB, fait de pages-images, s'ouvre dans le lecteur de planches, comme un CBZ.
    await volume67.click()
    await expect(page).toHaveURL(/\/read\//)
    await expect(page.getByRole('img', { name: `Page 1 sur ${KINDLE_PAGES.length}` })).toBeVisible()
    await expect(page.getByText('One Piece · vol. 67')).toBeVisible()
    await page.keyboard.press('ArrowRight')
    await expect(page.getByRole('img', { name: `Page 2 sur ${KINDLE_PAGES.length}` })).toBeVisible()
  })
})
