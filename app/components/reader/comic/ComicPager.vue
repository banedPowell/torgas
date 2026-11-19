<script setup lang="ts">
import type { ReadingDirection } from '~/types/core'
import { comicThumbnailWindow } from '~/utils/comic'

/** Barre du bas : miniatures autour de la page, sens de lecture, curseur de page. */
const props = defineProps<{
  page: number
  pageCount: number
  direction: ReadingDirection
  resolve: (page: number) => Promise<string>
}>()

const emit = defineEmits<{ go: [page: number]; toggleDirection: [] }>()

const { t } = useI18n()
const strip = computed(() => {
  const pages = comicThumbnailWindow(props.page, props.pageCount)
  return props.direction === 'rtl' ? pages.reverse() : pages
})
const directionLabel = computed(() =>
  t('reader.comic.direction.toggle', { value: t(`reader.comic.direction.${props.direction}`) }),
)
const slider = computed({
  get: () => props.page + 1,
  set: (value: number | undefined) => value !== undefined && emit('go', value - 1),
})
</script>

<template>
  <footer class="flex flex-col gap-3 bg-muted/95 px-4 pt-3 pb-6 backdrop-blur-sm">
    <nav
      :aria-label="$t('reader.comic.thumbnailStrip')"
      class="flex justify-center gap-1.5 overflow-hidden"
    >
      <ComicThumb
        v-for="p in strip"
        :key="p"
        :page="p"
        :active="p === page"
        :resolve="resolve"
        class="w-11"
        @select="emit('go', $event)"
      />
    </nav>
    <div class="flex items-center gap-3">
      <UButton
        color="neutral"
        variant="outline"
        class="h-11 px-2.5 font-mono text-xs"
        :aria-label="directionLabel"
        @click="emit('toggleDirection')"
      >
        {{ $t(`reader.comic.direction.${direction}Short`) }}
      </UButton>
      <USlider
        v-model="slider"
        :min="1"
        :max="Math.max(pageCount, 1)"
        size="lg"
        :inverted="direction === 'rtl'"
        :aria-label="$t('reader.comic.pageSlider')"
        class="flex-1"
      />
      <span class="shrink-0 font-mono text-xs text-muted tabular-nums">
        {{ $t('reader.comic.pageCounter', { page: page + 1, total: pageCount }) }}
      </span>
    </div>
  </footer>
</template>
