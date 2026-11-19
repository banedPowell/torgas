import { expect, type Frame, type Page } from '@playwright/test'
import type { Fixture } from './fixtures'

/** Ouvre la bibliothèque et attend que le cœur (wasm + OPFS + SQLite) ait répondu. */
export async function openLibrary(page: Page): Promise<void> {
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1, name: 'Bibliothèque' })).toBeVisible()
  await expect(page.getByRole('status', { name: 'Chargement de la bibliothèque' })).toBeHidden()
}

/** Importe un fichier par le sélecteur de fichiers, comme le ferait l'utilisateur. */
export async function importFile(page: Page, fixture: Fixture): Promise<void> {
  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'Importer des œuvres', exact: true }).click()
  const files = await chooser
  await files.setFiles({ name: fixture.name, mimeType: fixture.mimeType, buffer: fixture.buffer })
}

/** Carte d'une œuvre (nom accessible : couverture, badge de format, titre, auteur, progression). */
export function workCard(page: Page, title: string) {
  return page.getByRole('link', { name: new RegExp(`(EPUB|CBZ)\\s${title}\\s`) })
}

/** Ouvre une œuvre depuis sa carte puis lance (ou reprend) la lecture depuis la fiche. */
export async function openFromLibrary(page: Page, title: string): Promise<void> {
  await workCard(page, title).click()
  await page.getByRole('link', { name: /^(Lire|Reprendre à)/ }).click()
  await expect(page).toHaveURL(/\/read\//)
}

/** Attend la fin de l'ouverture d'un EPUB : squelette retiré, premier chapitre rendu. */
export async function waitForBook(page: Page, firstHeading: string): Promise<void> {
  await expect(page.getByRole('status', { name: 'Ouverture du livre' })).toBeHidden()
  await expect
    .poll(() => bookFrame(page)?.getByRole('heading', { name: firstHeading }).count())
    .toBe(1)
  // La mise en page se stabilise (polices, colonnes) : la position bouge seule au début.
  let last: string | null = null
  let steady = 0
  await expect
    .poll(
      async () => {
        const percent = await readerPercent(page)
        steady = percent !== null && percent === last ? steady + 1 : 0
        last = percent
        return steady
      },
      { intervals: [300] },
    )
    .toBeGreaterThanOrEqual(3)
}

/**
 * Tourne une page au clavier. foliate-js ignore les touches tant qu'une page tourne encore (la
 * position est publiée avant la fin de l'animation) : on réessaie jusqu'à voir la position bouger.
 */
export async function turnPage(page: Page): Promise<void> {
  const before = await readerPercent(page)
  await expect(async () => {
    await page.keyboard.press('ArrowRight')
    await expect.poll(() => readerPercent(page), { timeout: 1500 }).not.toBe(before)
  }).toPass({ timeout: 15_000 })
  await page.waitForTimeout(500)
}

/** Cadre (iframe en blob) dans lequel foliate-js rend le chapitre courant de l'EPUB. */
export function bookFrame(page: Page): Frame | undefined {
  return page.frames().find((frame) => frame.url().startsWith('blob:'))
}

/**
 * Position affichée par le lecteur EPUB : le curseur quand la barre est visible, sinon le
 * pourcentage discret en bas de page. `null` tant que la première position n'est pas connue.
 */
export async function readerPercent(page: Page): Promise<string | null> {
  const slider = page.getByRole('slider', { name: "Position dans l'œuvre" })
  if (await slider.count()) return slider.getAttribute('aria-valuetext')
  const label = page.getByText(/^\d+\s%$/)
  return (await label.count()) ? label.first().textContent() : null
}
