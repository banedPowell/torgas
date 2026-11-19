<script setup lang="ts">
import type { SeriesSummary } from '~/types/work'

defineProps<{
  /** Progression globale, de 0 à 1. */
  progress: number
  /** Présent pour une série : volumes (ou chapitres) terminés sur total. */
  summary?: SeriesSummary | null
}>()
</script>

<template>
  <section :aria-label="$t('work.progress.label')" class="flex flex-col gap-2">
    <div class="flex items-baseline justify-between gap-3">
      <span class="font-mono text-xs text-toned">
        <template v-if="summary">
          {{
            $t(`work.progress.${summary.unit}`, { read: summary.finished, total: summary.total })
          }}
        </template>
        <template v-else>{{ $t('work.progress.read') }}</template>
      </span>
      <span class="font-mono text-sm font-medium text-highlighted">
        {{ formatPercent(progress) }}
      </span>
    </div>
    <UProgress
      :model-value="Math.round(clampProgress(progress) * 100)"
      size="md"
      :aria-label="$t('library.entry.progress', { percent: formatPercent(progress) })"
    />
  </section>
</template>
