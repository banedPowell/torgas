<script setup lang="ts">
import type { Work } from '~/types/core'
import type { VolumeRow } from '~/types/work'

const props = defineProps<{
  rows: readonly VolumeRow[]
  /** Volume mis en avant : le premier non terminé. */
  nextId?: string
  /** Numéros de volumes absents de la bibliothèque. */
  missing: readonly number[]
  /** Titre masqué visuellement (la bascule Volumes / Chapitres le remplace). */
  titleHidden?: boolean
}>()

const { t } = useI18n()

function state(work: Work): string {
  if (work.status === 'finished' || work.progress >= 1) return t('work.volumes.finished')
  if (work.progress > 0)
    return t('work.volumes.inProgress', { percent: formatPercent(work.progress) })
  return t('work.volumes.notStarted')
}

function volumeLabel(row: Extract<VolumeRow, { kind: 'volume' }>): string {
  return row.number === undefined ? row.work.title : t('work.volumes.number', { n: row.number })
}

const incomplete = computed(() =>
  t('work.volumes.incomplete', { list: formatVolumeNumbers(props.missing) }, props.missing.length),
)
</script>

<template>
  <section :aria-label="$t('work.volumes.title')" class="flex flex-col gap-3">
    <h2 :class="titleHidden ? 'sr-only' : 'font-display text-xl font-medium text-highlighted'">
      {{ $t('work.volumes.title') }}
    </h2>

    <ul class="divide-y divide-default border-y border-default">
      <li v-for="row in rows" :key="row.kind === 'volume' ? row.work.id : `gap-${row.numbers[0]}`">
        <div v-if="row.kind === 'gap'" class="flex min-h-16 items-center gap-3.5 px-2 py-2.5">
          <div
            aria-hidden="true"
            class="flex h-[54px] w-[38px] shrink-0 items-center justify-center rounded-sm border border-dashed border-accented font-display text-lg text-muted"
          >
            ?
          </div>
          <div class="flex min-w-0 flex-col gap-0.5">
            <span class="text-[15px] font-semibold text-toned">
              {{
                $t(
                  'work.volumes.gap',
                  { list: formatVolumeNumbers(row.numbers) },
                  row.numbers.length,
                )
              }}
            </span>
            <span class="text-xs text-muted">{{ $t('work.volumes.missingFile') }}</span>
          </div>
        </div>

        <NuxtLink
          v-else
          :to="`/read/${row.work.id}`"
          :aria-label="`${volumeLabel(row)} · ${state(row.work)}`"
          :class="[
            'flex min-h-16 items-center gap-3.5 rounded-md px-2 py-2.5 text-highlighted hover:bg-muted focus-visible:outline-2 focus-visible:outline-primary',
            row.work.id === nextId ? 'my-1 bg-elevated ring-1 ring-primary ring-inset' : '',
          ]"
        >
          <div
            aria-hidden="true"
            :class="[
              'flex h-[54px] w-[38px] shrink-0 items-center justify-center rounded-sm font-display text-lg',
              row.work.status === 'finished'
                ? 'bg-inverted text-inverted'
                : 'bg-accented text-highlighted',
            ]"
          >
            {{ row.number ?? '·' }}
          </div>
          <div class="flex min-w-0 flex-1 flex-col gap-1">
            <span
              v-if="row.work.id === nextId"
              class="font-mono text-[11px] tracking-wider text-primary uppercase"
            >
              {{ $t('work.volumes.next') }}
            </span>
            <span class="truncate text-[15px] font-semibold">{{ volumeLabel(row) }}</span>
            <span class="truncate text-xs text-muted">
              {{ state(row.work) }} · {{ formatBytes(row.work.sizeBytes) }}
            </span>
            <UProgress
              v-if="row.work.progress > 0 && row.work.status !== 'finished'"
              :model-value="Math.round(row.work.progress * 100)"
              size="2xs"
              :aria-label="
                $t('library.entry.progress', { percent: formatPercent(row.work.progress) })
              "
            />
          </div>
          <UIcon
            v-if="row.work.status === 'finished'"
            name="i-lucide-check"
            class="size-5 shrink-0 text-primary"
            :aria-label="$t('work.volumes.finished')"
            role="img"
          />
          <UIcon
            v-else
            name="i-lucide-chevron-right"
            class="size-5 shrink-0 text-dimmed"
            aria-hidden="true"
          />
        </NuxtLink>
      </li>
    </ul>

    <UAlert
      v-if="missing.length > 0"
      color="neutral"
      variant="subtle"
      icon="i-lucide-triangle-alert"
      :description="incomplete"
    />
  </section>
</template>
