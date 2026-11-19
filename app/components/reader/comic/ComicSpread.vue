<script setup lang="ts">
import type { ComicFit } from '~/utils/comic'

const props = defineProps<{
  /** Pages de la planche, dans l'ordre d'affichage de gauche à droite. */
  pages: readonly number[]
  total: number
  fit: ComicFit
  resolve: (page: number, fresh?: boolean) => Promise<string>
}>()

/** En double page, chaque page se colle contre la reliure, au centre. */
function align(index: number) {
  if (props.pages.length < 2) return 'center'
  return index === 0 ? 'end' : 'start'
}
</script>

<template>
  <div
    class="flex w-full"
    :class="{
      'min-h-full items-start': fit === 'width',
      'h-full': fit === 'screen',
      'h-full w-max min-w-full justify-center': fit === 'height',
    }"
  >
    <ComicPage
      v-for="(page, index) in pages"
      :key="page"
      :page="page"
      :total="total"
      :fit="fit"
      :resolve="resolve"
      :align="align(index)"
    />
  </div>
</template>
