<script setup lang="ts">
import type { SeriesView } from '~/types/work'

/** Bascule « Volumes / Chapitres » d'une série qui a les deux. */
const props = defineProps<{
  volumeCount: number
  chapterCount: number
}>()

const view = defineModel<SeriesView>({ required: true })

const { t } = useI18n()
const items = computed(() =>
  (['volumes', 'chapters'] as const).map((value) => ({
    value,
    label: t(`work.views.${value}`),
    badge: {
      label: String(value === 'volumes' ? props.volumeCount : props.chapterCount),
      color: 'neutral' as const,
      variant: 'soft' as const,
    },
  })),
)
</script>

<template>
  <UTabs
    v-model="view"
    :items="items"
    :content="false"
    variant="link"
    color="primary"
    :aria-label="$t('work.views.label')"
    class="w-full"
    :ui="{ trigger: 'min-h-11 flex-1 font-display text-lg', label: 'font-medium' }"
  />
</template>
