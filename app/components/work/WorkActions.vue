<script setup lang="ts">
import type { ReadAction } from '~/types/work'

const props = defineProps<{
  /** Œuvre à ouvrir. */
  workId: string
  action: ReadAction
  /** Numéro du volume visé, pour une série. */
  volume?: number
}>()

const { t } = useI18n()

const label = computed(() => {
  const { kind, percent } = props.action
  const params = { percent: formatPercent(percent / 100), volume: props.volume }
  const suffix = props.volume === undefined ? '' : 'Volume'
  return t(`work.action.${kind}${suffix}`, params)
})
const icon = computed(() =>
  props.action.kind === 'reread' ? 'i-lucide-rotate-ccw' : 'i-lucide-play',
)
</script>

<template>
  <UButton
    :to="`/read/${workId}`"
    :icon="icon"
    size="xl"
    block
    :label="label"
    class="h-13 justify-center rounded-xl text-base font-semibold"
  />
</template>
