<script setup lang="ts">
import type { ReadAction } from '~/types/work'

const props = defineProps<{
  /** Œuvre à ouvrir. */
  workId: string
  action: ReadAction
  /** Numéro du volume visé, pour une série. */
  volume?: number
  /** Numéro du chapitre visé, pour une série de chapitres (prime sur `volume`). */
  chapterNumber?: number
  /** Chapitre en cours (œuvre seule), pour « Reprendre à « … » ». */
  chapter?: string
}>()

const { t } = useI18n()

const label = computed(() => {
  const { kind, percent } = props.action
  const params = {
    percent: formatPercent(percent / 100),
    volume: props.volume,
    chapter: props.chapterNumber === undefined ? '' : formatIssueNumber(props.chapterNumber),
  }
  if (props.chapterNumber !== undefined) return t(`work.action.${kind}Issue`, params)
  if (kind === 'resume' && props.chapter && props.volume === undefined) {
    return t('work.action.resumeChapter', { chapter: props.chapter })
  }
  const suffix = props.volume === undefined ? '' : 'Volume'
  return t(`work.action.${kind}${suffix}`, params)
})
const icon = computed(() =>
  props.action.kind === 'reread' ? 'i-lucide-rotate-ccw' : 'i-lucide-play',
)
</script>

<template>
  <UButton
    :to="readPath({ id: workId })"
    :icon="icon"
    size="xl"
    block
    :label="label"
    class="h-13 justify-center rounded-lg text-base font-semibold"
  />
</template>
