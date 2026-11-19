<script setup lang="ts">
const props = defineProps<{
  /** Progression globale, de 0 à 1. */
  progress: number
  pageLabel?: string
  chapterMinutesLeft?: number
}>()

const emit = defineEmits<{ seek: [fraction: number] }>()

// Valeur locale : le curseur bouge librement, la position n'est appliquée qu'au relâchement.
const value = ref(Math.round(props.progress * 1000))
watch(
  () => props.progress,
  (p) => (value.value = Math.round(p * 1000)),
)

const { t } = useI18n()
const position = computed(() =>
  [
    props.pageLabel && t('reader.progress.page', { page: props.pageLabel }),
    formatPercent(props.progress),
  ]
    .filter(Boolean)
    .join(' · '),
)

const minutes = computed(() =>
  props.chapterMinutesLeft === undefined
    ? undefined
    : Math.max(1, Math.round(props.chapterMinutesLeft)),
)
</script>

<template>
  <footer
    class="flex flex-col gap-2.5 border-t border-default bg-elevated px-5 pt-3.5 pb-[max(1.625rem,env(safe-area-inset-bottom))] text-default"
  >
    <USlider
      v-model="value"
      :min="0"
      :max="1000"
      :step="1"
      size="sm"
      :aria-label="$t('reader.progress.label')"
      :aria-valuetext="formatPercent(value / 1000)"
      @change="emit('seek', value / 1000)"
    />
    <div class="flex justify-between gap-3 font-mono text-xs text-muted">
      <span class="shrink-0">{{ position }}</span>
      <span v-if="minutes !== undefined" class="truncate">
        {{ $t('reader.progress.minutesLeft', { n: minutes }, minutes) }}
      </span>
    </div>
  </footer>
</template>
