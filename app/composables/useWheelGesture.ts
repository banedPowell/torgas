import type { WheelCommit, WheelLike } from '~/utils/wheel'
import { createWheelGesture } from '~/utils/wheel'

/**
 * Geste à deux doigts au trackpad (voir `createWheelGesture`) avec sa fin programmée : `onEnd`
 * est appelé une fois le flux d'événements arrêté, vite si les doigts sont levés, tard s'ils
 * semblent encore posés. Tout nouvel événement repousse la fin.
 */
export function useWheelGesture(onEnd: (end: { commit: WheelCommit; offset: number }) => void) {
  const gesture = createWheelGesture()
  let timer: ReturnType<typeof setTimeout> | undefined

  function push(e: WheelLike, pageSize: number) {
    const result = gesture.push(e, pageSize)
    clearTimeout(timer)
    timer = setTimeout(() => onEnd(gesture.finish()), gesture.endDelay())
    return result
  }

  onScopeDispose(() => clearTimeout(timer))
  return { push }
}
