<script setup lang="ts">
import type { LibraryEntry } from '~/types/library'

const props = defineProps<{ entry: LibraryEntry }>()

const { t } = useI18n()
const summary = computed(() => summarizeEntry(props.entry))
const badge = computed(() => {
  const format = t(`format.${summary.value.format}`)
  return summary.value.isSeries ? t('library.entry.seriesBadge', { format }) : format
})
const meta = computed(() =>
  summary.value.isSeries
    ? t('library.entry.volumes', {
        read: summary.value.volumesFinished,
        total: summary.value.volumesTotal,
      })
    : formatAuthors(summary.value.authors) || t('library.entry.unknownAuthor'),
)
</script>

<template>
  <NuxtLink
    :to="summary.href"
    class="group flex flex-col gap-1.5 rounded-md text-highlighted focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
  >
    <div class="relative aspect-[2/3]">
      <div
        v-if="summary.isSeries"
        aria-hidden="true"
        class="absolute -top-1 right-[-2px] bottom-1.5 left-1.5 rounded-sm bg-(--ui-border-accented)"
      />
      <CoverImage
        :src="summary.coverUrl"
        :title="summary.title"
        class="absolute inset-0 transition-transform duration-150 group-hover:-translate-y-0.5"
      />
      <span
        class="absolute top-1.5 left-1.5 rounded-sm bg-scrim px-[5px] py-0.5 font-mono text-[9px] leading-tight tracking-wider text-on-scrim uppercase"
      >
        {{ badge }}
      </span>
    </div>
    <div class="flex min-w-0 flex-col gap-0.5">
      <span class="line-clamp-2 text-[13px] leading-tight font-semibold">{{ summary.title }}</span>
      <span class="truncate text-xs text-muted">{{ meta }}</span>
    </div>
    <UProgress
      :model-value="Math.round(summary.progress * 100)"
      size="2xs"
      :aria-label="$t('library.entry.progress', { percent: formatPercent(summary.progress) })"
    />
  </NuxtLink>
</template>
