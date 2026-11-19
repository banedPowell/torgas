<script setup lang="ts">
import type { ReadingDirection } from '~/types/core'
import { comicTapAction, type ComicFit, type ComicSide } from '~/utils/comic'

/**
 * Lecture page à page : zones de tap (gauche, centre, droite) et glissement horizontal.
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
  const action = comicTapAction(event.clientX - rect.left, rect.width, props.direction)
  if (action === 'menu') emit('menu')
  else if (action === 'next') emit('next')
  else emit('prev')
}

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
