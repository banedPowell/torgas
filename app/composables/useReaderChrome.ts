/** Délai avant que la barre du lecteur ne se masque seule. */
export const CHROME_HIDE_DELAY = 3000

/**
 * Barre escamotable du lecteur : visible à l'ouverture, masquée après 3 s sans interaction,
 * jamais masquée tant qu'un panneau (sommaire, réglages) est ouvert.
 */
export function useReaderChrome() {
  const visible = ref(true)
  const pinned = ref(false)

  const timer = useTimeoutFn(
    () => {
      if (!pinned.value) visible.value = false
    },
    CHROME_HIDE_DELAY,
    { immediate: false },
  )

  function show(): void {
    visible.value = true
    timer.stop()
    if (!pinned.value) timer.start()
  }

  function hide(): void {
    timer.stop()
    if (!pinned.value) visible.value = false
  }

  function toggle(): void {
    if (visible.value) hide()
    else show()
  }

  /** Une interaction avec la barre relance le délai. */
  function keepAlive(): void {
    if (visible.value) show()
  }

  function setPinned(value: boolean): void {
    pinned.value = value
    show()
  }

  show()

  return { visible: readonly(visible), show, hide, toggle, keepAlive, setPinned }
}
