import { expect, test } from './test'
import {
  EPUB_AUTHOR,
  NOTES_EPUB_CHAPTERS,
  NOTES_EPUB_NOTES,
  NOTES_EPUB_TITLE,
  makeNotesOnlyEpub,
} from './fixtures'
import { bookTextVisible, importFile, openFromLibrary, openLibrary, workCard } from './helpers'

test.describe('EPUB : sommaire fait de notes seulement (#40)', () => {
  test('reconstruit le sommaire depuis le spine et range les notes à part', async ({ page }) => {
    await openLibrary(page)
    await importFile(page, makeNotesOnlyEpub())
    await expect(workCard(page, NOTES_EPUB_TITLE)).toBeVisible()
    await openFromLibrary(page, NOTES_EPUB_TITLE)
    await expect(page.getByRole('status', { name: 'Ouverture du livre' })).toBeHidden()

    // Un tap au centre affiche la barre (elle se masque seule), puis on ouvre le sommaire.
    const tocButton = page.getByRole('button', { name: 'Sommaire', exact: true })
    await expect(async () => {
      if (!(await tocButton.isVisible())) await page.mouse.click(640, 400)
      await tocButton.click({ timeout: 1000 })
      await expect(page.getByRole('dialog')).toBeVisible({ timeout: 1000 })
    }).toPass({ timeout: 15_000 })
    const contents = page.getByRole('navigation', { name: 'Sommaire' })
    await expect(contents.getByRole('button')).toHaveText([...NOTES_EPUB_CHAPTERS, 'Notes'])
    await expect(page.getByRole('button', { name: '[1]' })).toBeHidden()

    // Les notes sont repliées dans leur propre groupe.
    const notes = page.getByRole('button', { name: `Notes · ${NOTES_EPUB_NOTES}` })
    await expect(notes).toHaveAttribute('aria-expanded', 'false')
    await notes.click()
    await expect(page.getByRole('navigation', { name: 'Notes' }).getByRole('button')).toHaveText(
      Array.from({ length: NOTES_EPUB_NOTES }, (_, i) => `[${i + 1}]`),
    )

    // Un chapitre mène à son intitulé, qui devient le chapitre courant (jamais « [n] »).
    await contents.getByRole('button', { name: 'II', exact: true }).click()
    await expect.poll(() => bookTextVisible(page, 'II')).toBe(true)
    // La barre se masque seule : on la rappelle d'un tap si besoin.
    const subtitle = page.getByText(`${EPUB_AUTHOR} · II`, { exact: true })
    await expect(async () => {
      if (!(await subtitle.isVisible())) await page.mouse.click(640, 400)
      await expect(subtitle).toBeVisible({ timeout: 1000 })
    }).toPass({ timeout: 15_000 })
  })
})
