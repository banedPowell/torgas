<script setup lang="ts">
import type { LibraryEntry } from '~/types/library'
import type { EntrySummary } from '~/utils/library'

const props = defineProps<{
  entries: readonly LibraryEntry[]
  /** Liste virtualisée (au-delà de VIRTUAL_LIST_THRESHOLD entrées). */
  virtualized?: boolean
}>()

const ROW_HEIGHT = 84

const { t } = useI18n()
const summaries = computed(() => props.entries.map(summarizeEntry))
const virtualSource = computed(() => (props.virtualized ? summaries.value : []))
const { list, containerProps, wrapperProps } = useVirtualList(virtualSource, {
  itemHeight: ROW_HEIGHT,
  overscan: 8,
})
const rows = computed(() =>
  props.virtualized ? list.value.map((item) => item.data) : summaries.value,
)

function meta(summary: EntrySummary): string {
  const format = t(`format.${summary.format}`)
  const detail = summary.isSeries
    ? t('library.entry.volumes', { read: summary.volumesFinished, total: summary.volumesTotal })
    : formatAuthors(summary.authors) || t('library.entry.unknownAuthor')
  return `${format} · ${detail}`
}
</script>

<template>
  <div v-bind="virtualized ? containerProps : {}" :class="virtualized ? 'min-h-0 flex-1' : ''">
    <ul v-bind="virtualized ? wrapperProps : {}" class="divide-y divide-default">
      <li v-for="summary in rows" :key="summary.id" :style="{ height: `${ROW_HEIGHT}px` }">
        <NuxtLink
          :to="summary.href"
          class="flex h-full items-center gap-3 rounded-md px-1 text-highlighted hover:bg-muted focus-visible:outline-2 focus-visible:outline-primary"
        >
          <CoverImage :src="summary.coverUrl" :title="summary.title" class="h-16 w-11 shrink-0" />
          <div class="flex min-w-0 flex-1 flex-col gap-1">
            <span class="truncate text-sm font-semibold">{{ summary.title }}</span>
            <span class="truncate text-xs text-muted">{{ meta(summary) }}</span>
            <UProgress
              :model-value="Math.round(summary.progress * 100)"
              size="2xs"
              :aria-label="
                $t('library.entry.progress', { percent: formatPercent(summary.progress) })
              "
            />
          </div>
          <span class="w-12 shrink-0 text-right font-mono text-xs text-muted">
            {{ formatPercent(summary.progress) }}
          </span>
        </NuxtLink>
      </li>
    </ul>
  </div>
</template>
