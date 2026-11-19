<script setup lang="ts">
import type { Work } from '~/types/core'

defineProps<{ work: Work }>()
const emit = defineEmits<{ dismiss: [] }>()
</script>

<template>
  <aside
    :aria-label="$t('resume.label')"
    class="flex items-center gap-1 rounded-[14px] bg-inverted py-2 ps-2.5 pe-1 text-inverted"
  >
    <NuxtLink
      :to="`/works/${work.id}`"
      :aria-label="$t('resume.open', { title: work.title })"
      class="flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-[10px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current"
    >
      <CoverImage :src="work.coverUrl" :title="work.title" class="h-[50px] w-9 shrink-0" />
      <div class="flex min-w-0 flex-1 flex-col gap-1">
        <span class="truncate text-sm font-semibold">{{ work.title }}</span>
        <div class="flex items-center gap-2">
          <UProgress
            :model-value="Math.round(work.progress * 100)"
            size="2xs"
            color="neutral"
            class="flex-1"
            :ui="{ base: 'bg-(--ui-text-dimmed)', indicator: 'bg-accented' }"
            :aria-label="$t('library.entry.progress', { percent: formatPercent(work.progress) })"
          />
          <span class="font-mono text-[11px] text-dimmed">{{ formatPercent(work.progress) }}</span>
        </div>
      </div>
    </NuxtLink>
    <UButton
      :to="`/read/${work.id}`"
      icon="i-lucide-play"
      color="neutral"
      variant="solid"
      :aria-label="$t('resume.action', { title: work.title })"
      class="size-11 shrink-0 justify-center rounded-full bg-default text-highlighted hover:bg-muted"
    />
    <UButton
      icon="i-lucide-x"
      color="neutral"
      variant="ghost"
      :aria-label="$t('resume.dismiss')"
      class="size-11 shrink-0 justify-center rounded-full text-inverted hover:bg-accented/20"
      @click="emit('dismiss')"
    />
  </aside>
</template>
