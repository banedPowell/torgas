<script setup lang="ts">
import type { ReadingDirection } from '~/types/core'
import { comicTapAction, type ComicFit, type ComicSide } from '~/utils/comic'

/**
 * Lecture page à page : zones de tap (bande du haut, gauche, centre, droite) et glissement.
 * La fin de volume s'affiche dans le slot `end`.
 */
const props = defineProps<{
  /** Pages de la planche, dans l'ordre d'affichage de gauche à droite. */
  pages: readonly number[]
  total: number
  fit: ComicFit
  direction: ReadingDirection
  ended: boolean
  resolve: (page: number, fresh?: boolean) => Promise<string>
}>()

const emit = defineEmits<{ next: []; prev: []; side: [side: ComicSide]; menu: [] }>()

const stage = useTemplateRef<HTMLElement>('stage')

function onClick(event: MouseEvent) {
  if (!stage.value) return
  const rect = stage.value.getBoundingClientRect()
  const point = { x: event.clientX - rect.left, y: event.clientY - rect.top }
  const action = comicTapAction(point, rect, props.direction)
  if (action === 'menu') emit('menu')
  else if (action === 'next') emit('next')
  else emit('prev')
}

// Glissement à deux doigts au trackpad, façon Livres d'Apple : la planche suit les doigts, puis
// sort de l'écran pendant que la suivante entre (ou revient en place si le geste est annulé).
const wheelGesture = createWheelGesture()
/** Décalage horizontal de la planche (px, positif vers la gauche de l'écran). */
const slide = ref(0)
const sliding = ref(false)
const SLIDE_MS = 180

async function finishWheelGesture() {
  const { commit } = wheelGesture.finish()
  const width = stage.value?.clientWidth ?? 0
  const side = wheelSide(commit)
  sliding.value = true
  if (!side || !width) {
    slide.value = 0
    return
  }
  slide.value = commit * width
  await new Promise((resolve) => setTimeout(resolve, SLIDE_MS))
  emit('side', side)
  // La planche suivante part du bord opposé, puis glisse en place.
  sliding.value = false
  slide.value = -commit * width
  await nextTick()
  await new Promise(requestAnimationFrame)
  sliding.value = true
  slide.value = 0
}
const endWheelGesture = useDebounceFn(finishWheelGesture, wheelGesture.gestureGap)

// Écouté sur la fenêtre : le navigateur envoie toute une série d'événements wheel à l'élément
// visé par le premier, qui peut être une planche déjà remplacée (inertie après le changement).
useEventListener(
  window,
  'wheel',
  (e: WheelEvent) => {
    const el = stage.value
    if (!el || (e.target as Element | null)?.closest?.('[role="dialog"]')) return
    const box = el.getBoundingClientRect()
    const inside =
      e.clientX >= box.left &&
      e.clientX <= box.right &&
      e.clientY >= box.top &&
      e.clientY <= box.bottom
    // Planche agrandie qui défile en largeur : le geste sert à la parcourir. Vérifié planche au
    // repos seulement : pendant le glissé, la translation élargit la zone de défilement.
    if (!inside || (slide.value === 0 && el.scrollWidth > el.clientWidth + 1)) return
    const { consume, offset } = wheelGesture.push(
      {
        deltaX: e.deltaX,
        deltaY: e.deltaY,
        deltaMode: e.deltaMode,
        ctrlKey: e.ctrlKey,
        timeStamp: e.timeStamp,
      },
      el.clientWidth,
    )
    if (!consume) return
    e.preventDefault()
    sliding.value = false
    slide.value = offset
    void endWheelGesture()
  },
  { passive: false },
)

useSwipe(stage, {
  threshold: 50,
  onSwipeEnd(_, swipe) {
    // Le doigt part vers la gauche : on va vers la page de droite, et inversement.
    if (swipe === 'left') emit('side', 'right')
    else if (swipe === 'right') emit('side', 'left')
  },
})
</script>

<template>
  <div
    ref="stage"
    class="size-full overflow-auto overscroll-contain"
    :class="{ 'overflow-x-hidden': fit === 'width' }"
    @click="onClick"
  >
    <div v-if="ended" class="flex min-h-full items-center p-4" @click.stop>
      <slot name="end" />
    </div>
    <div
      v-else
      class="size-full will-change-transform"
      :class="sliding ? 'transition-transform duration-[180ms] ease-out' : ''"
      :style="slide ? { transform: `translateX(${-slide}px)` } : undefined"
    >
      <ComicSpread :pages="pages" :total="total" :fit="fit" :resolve="resolve" />
    </div>
  </div>
</template>
