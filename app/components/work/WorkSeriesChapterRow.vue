<script setup lang="ts">
import type { Work } from '~/types/core'
import type { SeriesChapterRow } from '~/types/work'

/** Une ligne de la liste des chapitres d'une série : intitulé de volume, chapitre ou trou. */
const props = defineProps<{
  row: SeriesChapterRow
  /** Chapitre mis en avant : le prochain à lire. */
  next?: boolean
}>()

const emit = defineEmits<{ remove: [work: Work] }>()

const { t } = useI18n()
const itemMenu = useWorkItemMenu()
const menu = computed(() => {
  const row = props.row
  if (row.kind !== 'chapter') return []
  const work = row.work
  return itemMenu(work, () => emit('remove', work))
})

const label = computed(() => {
  const row = props.row
  if (row.kind !== 'chapter') return ''
  return row.title || t('work.seriesChapters.number', { n: formatIssueNumber(row.number) })
})

const detail = computed(() => {
  const row = props.row
  if (row.kind !== 'chapter') return ''
  if (row.state === 'read') return t('work.seriesChapters.read')
  if (row.state === 'current') {
    return t('work.seriesChapters.inProgress', { percent: formatPercent(row.work.progress) })
  }
  return t('work.seriesChapters.notStarted')
})

const gapLabel = computed(() => {
  const row = props.row
  if (row.kind !== 'gap') return ''
  const list =
    row.from === row.to
      ? formatIssueNumber(row.from)
      : t('work.seriesChapters.range', { from: row.from, to: row.to })
  return t('work.seriesChapters.gap', { list }, row.count)
})
</script>

<template>
  <div
    v-if="row.kind === 'group'"
    class="flex h-full items-end justify-between gap-3 px-2 pb-1.5 font-mono text-[11px] tracking-[0.06em] text-muted uppercase"
  >
    <span>
      {{
        row.volume === undefined
          ? $t('work.seriesChapters.noVolume')
          : $t('work.seriesChapters.group', { n: formatIssueNumber(row.volume) })
      }}
    </span>
    <span>{{ $t('work.seriesChapters.groupCount', { n: row.count }) }}</span>
  </div>

  <div v-else-if="row.kind === 'gap'" class="flex h-full items-center gap-3 px-2">
    <span
      aria-hidden="true"
      class="flex h-9 w-14 shrink-0 items-center justify-center rounded-sm border border-dashed border-accented font-mono text-xs text-muted"
    >
      ?
    </span>
    <span class="min-w-0 truncate text-sm text-toned">{{ gapLabel }}</span>
  </div>

  <div v-else class="flex h-full items-center gap-1">
    <UContextMenu :items="menu" class="h-full min-w-0 flex-1">
      <NuxtLink
        :to="readPath(row.work)"
        :aria-label="`${$t('work.seriesChapters.number', { n: formatIssueNumber(row.number) })}${row.title ? ` · ${row.title}` : ''} · ${$t(`format.${row.work.format}`)} · ${detail}`"
        :class="[
          'flex h-full min-w-0 flex-1 items-center gap-3 rounded-md px-2 focus-visible:outline-2 focus-visible:outline-primary',
          row.state === 'read' ? 'text-muted' : 'text-highlighted',
          next ? 'bg-elevated ring-1 ring-primary ring-inset' : 'hover:bg-muted',
        ]"
      >
        <span class="w-14 shrink-0 font-mono text-xs text-muted">
          {{ formatIssueNumber(row.number) }}
        </span>
        <span class="flex min-w-0 flex-1 flex-col gap-0.5">
          <span v-if="next" class="font-mono text-[11px] tracking-wider text-primary uppercase">
            {{ $t('work.seriesChapters.next') }}
          </span>
          <span class="flex min-w-0 items-center gap-2">
            <span
              class="truncate text-[15px]"
              :class="row.state === 'current' || next ? 'font-semibold' : ''"
            >
              {{ label }}
            </span>
            <WorkFormatBadge :format="row.work.format" />
          </span>
          <span v-if="!next" class="truncate text-xs text-muted">{{ detail }}</span>
        </span>
        <UIcon
          v-if="row.state === 'read'"
          name="i-lucide-check"
          class="size-[18px] shrink-0 text-primary"
          aria-hidden="true"
        />
        <span
          v-else-if="row.state === 'current'"
          class="shrink-0 rounded-full bg-primary px-2 py-0.5 text-[11px] font-semibold text-inverted"
          aria-hidden="true"
        >
          {{ formatPercent(row.work.progress) }}
        </span>
        <UIcon
          name="i-lucide-chevron-right"
          class="size-5 shrink-0 text-dimmed"
          aria-hidden="true"
        />
      </NuxtLink>
    </UContextMenu>
    <WorkItemMenu :work="row.work" :label="label" @remove="emit('remove', $event)" />
  </div>
</template>
