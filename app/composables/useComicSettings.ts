import type { ComicFit, ComicLayoutPreference } from '~/utils/comic'

export interface ComicSettings {
  layout: ComicLayoutPreference
  fit: ComicFit
}

export const COMIC_SETTINGS_KEY = 'torgas:comic-settings'

const DEFAULTS: ComicSettings = { layout: 'auto', fit: 'screen' }
const LAYOUTS: readonly ComicLayoutPreference[] = ['auto', 'single', 'double', 'webtoon']
const FITS: readonly ComicFit[] = ['width', 'height', 'screen']

/** Valeurs relues depuis le stockage : on écarte tout ce qui n'est pas reconnu. */
function sanitize(value: Partial<ComicSettings> | null | undefined): ComicSettings {
  return {
    layout: LAYOUTS.includes(value?.layout as ComicLayoutPreference)
      ? (value!.layout as ComicLayoutPreference)
      : DEFAULTS.layout,
    fit: FITS.includes(value?.fit as ComicFit) ? (value!.fit as ComicFit) : DEFAULTS.fit,
  }
}

function readStored(): ComicSettings {
  try {
    const raw = localStorage.getItem(COMIC_SETTINGS_KEY)
    return sanitize(raw ? JSON.parse(raw) : null)
  } catch {
    return { ...DEFAULTS }
  }
}

function persist(value: ComicSettings) {
  try {
    localStorage.setItem(COMIC_SETTINGS_KEY, JSON.stringify(value))
  } catch {
    // Stockage indisponible (navigation privée, quota) : le réglage vaut pour la session.
  }
}

/**
 * Réglages du lecteur manga (mise en page, ajustement), partagés dans l'app et persistés sur
 * l'appareil. Le sens de lecture n'en fait pas partie : il est réglé par série dans le cœur.
 */
export function useComicSettings() {
  const settings = useState<ComicSettings>('comic:settings', readStored)

  function update(patch: Partial<ComicSettings>) {
    settings.value = sanitize({ ...settings.value, ...patch })
    persist(settings.value)
  }

  return {
    layout: computed(() => settings.value.layout),
    fit: computed(() => settings.value.fit),
    setLayout: (layout: ComicLayoutPreference) => update({ layout }),
    setFit: (fit: ComicFit) => update({ fit }),
    reset: () => update(DEFAULTS),
  }
}
