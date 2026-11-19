<script setup lang="ts">
import type { ContextMenuItem } from '@nuxt/ui'
import type { LibraryEntry } from '~/types/library'
import type { EntrySummary } from '~/utils/library'

const props = defineProps<{
  entries: readonly LibraryEntry[]
  /** Liste virtualisée (au-delà de VIRTUAL_LIST_THRESHOLD entrées). */
  virtualized?: boolean
  /** Mode sélection : les lignes se cochent (identifiants d'entrée cochés dans `selected`). */
  selecting?: boolean
  selected?: ReadonlySet<string>
  /** Menu contextuel de chaque entrée. */
  menuFor?: (entry: LibraryEntry) => ContextMenuItem[][]
}>()

const emit = defineEmits<{ toggle: [id: string] }>()

const ROW_HEIGHT = 84

const { t } = useI18n()
const NuxtLink = resolveComponent('NuxtLink')
const summaries = computed(() => props.entries.map(summarizeEntry))
const virtualSource = computed(() => (props.virtualized ? summaries.value : []))
const { list, containerProps, wrapperProps } = useVirtualList(virtualSource, {
  itemHeight: ROW_HEIGHT,
  overscan: 8,
})
const entryById = computed(() => new Map(props.entries.map((e) => [e.id, e])))
function menu(id: string): ContextMenuItem[][] {
  const entry = entryById.value.get(id)
  return entry && props.menuFor ? props.menuFor(entry) : []
}
const rows = computed(() =>
  props.virtualized ? list.value.map((item) => item.data) : summaries.value,
)

/** Lien vers la fiche, ou case à cocher (bouton) en mode sélection. */
function rowAttrs(summary: EntrySummary) {
  if (!props.selecting) return { to: summary.href }
  return {
    type: 'button',
    role: 'checkbox',
    'aria-checked': props.selected?.has(summary.id) ?? false,
    'aria-label': t('library.selection.select', { title: summary.title }),
    onClick: () => emit('toggle', summary.id),
  }
}

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
        <UContextMenu :items="menu(summary.id)" :disabled="!menuFor || selecting">
          <component
            :is="selecting ? 'button' : NuxtLink"
            v-bind="rowAttrs(summary)"
            class="flex h-full w-full items-center gap-3 rounded-md px-1 text-start [-webkit-touch-callout:none] text-highlighted hover:bg-muted focus-visible:outline-2 focus-visible:outline-primary"
          >
            <span
              v-if="selecting"
              aria-hidden="true"
              class="flex size-6 shrink-0 items-center justify-center rounded-[5px] border-2"
              :class="
                selected?.has(summary.id)
                  ? 'border-primary bg-primary text-inverted'
                  : 'border-(--ui-border-accented) text-transparent'
              "
            >
              <UIcon name="i-lucide-check" class="size-3.5" />
            </span>
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
          </component>
        </UContextMenu>
      </li>
    </ul>
  </div>
</template>
