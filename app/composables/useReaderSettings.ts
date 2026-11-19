import type { ReaderSettings, ResolvedReaderTheme } from '~/types/reader'
import { DEFAULT_READER_SETTINGS, sanitizeReaderSettings } from '~/utils/reader'

export const READER_SETTINGS_KEY = 'torgas:reader-settings'

function readStored(): ReaderSettings {
  try {
    const raw = localStorage.getItem(READER_SETTINGS_KEY)
    return raw ? sanitizeReaderSettings(JSON.parse(raw)) : { ...DEFAULT_READER_SETTINGS }
  } catch {
    // Stockage indisponible (navigation privée, quota) ou contenu corrompu.
    return { ...DEFAULT_READER_SETTINGS }
  }
}

function writeStored(settings: ReaderSettings): void {
  try {
    localStorage.setItem(READER_SETTINGS_KEY, JSON.stringify(settings))
  } catch {
    // Stockage indisponible : les réglages restent valables pour la session.
  }
}

/** Réglages typographiques du lecteur, partagés et persistés dans le navigateur. */
export function useReaderSettings() {
  const settings = useState<ReaderSettings>('reader:settings', readStored)
  const colorMode = useColorMode()

  const resolvedTheme = computed<ResolvedReaderTheme>(() => {
    const theme = settings.value.theme
    if (theme !== 'auto') return theme
    return colorMode.value === 'dark' ? 'dark' : 'paper'
  })

  function update(patch: Partial<ReaderSettings>): void {
    settings.value = sanitizeReaderSettings({ ...settings.value, ...patch })
    writeStored(settings.value)
  }

  function reset(): void {
    settings.value = { ...DEFAULT_READER_SETTINGS }
    writeStored(settings.value)
  }

  return { settings: readonly(settings), resolvedTheme, update, reset }
}
