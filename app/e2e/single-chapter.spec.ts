import { expect, test } from './test'
import { CBZ_PAGES, makeCbz } from './fixtures'
import { importFile, openLibrary } from './helpers'

test('un chapitre importé seul forme sa série et se lit', async ({ page }) => {
  await openLibrary(page)
  await importFile(page, makeCbz('One Piece - Chapitre 1201 - Le début.cbz'))
  await expect(page.getByRole('status', { name: 'Chargement de la bibliothèque' })).toBeHidden()

  const series = page.getByRole('link', { name: /^Couverture de One Piece/ })
  await expect(series).toContainText('0 / 1 chap.')
  await series.click()

  await expect(page.getByRole('heading', { level: 1, name: 'One Piece' })).toBeVisible()
  // Un seul chapitre : ni bascule Volumes / Chapitres, ni recherche.
  await expect(page.getByRole('tab', { name: /^Volumes/ })).toBeHidden()
  await expect(page.getByRole('searchbox', { name: 'Rechercher un chapitre' })).toBeHidden()
  await expect(page.getByRole('link', { name: /^Chapitre 1201 · Le début · CBZ · / })).toBeVisible()

  await page.getByRole('link', { name: 'Lire le chapitre 1201' }).click()
  await expect(page.getByRole('img', { name: `Page 1 sur ${CBZ_PAGES}` })).toBeVisible()
  await expect(page.getByText('One Piece · ch. 1201')).toBeVisible()
})
