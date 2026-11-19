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

// Glissement horizontal à deux doigts (trackpad) : une planche par geste.
const wheelPager = createWheelPager()
useEventListener(
  stage,
  'wheel',
  (e: WheelEvent) => {
    const { side, horizontal } = wheelPager.push({
      deltaX: e.deltaX,
      deltaY: e.deltaY,
      deltaMode: e.deltaMode,
      timeStamp: e.timeStamp,
    })
    // Planche agrandie qui défile en largeur : le geste sert à la parcourir.
    const el = stage.value
    if (!horizontal || (el && el.scrollWidth > el.clientWidth + 1)) return
    e.preventDefault()
    if (side) emit('side', side)
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
    <ComicSpread v-else :pages="pages" :total="total" :fit="fit" :resolve="resolve" />
  </div>
</template>
