<script setup lang="ts">
import type { SeriesChapterRow } from '~/types/work'
import type { ChapterGap } from '~/utils/seriesChapters'

/**
 * Chapitres d'une série (fiche, vue « Chapitres ») : recherche, liste regroupée par volume et
 * virtualisée au-delà de `VIRTUAL_LIST_THRESHOLD` lignes (plusieurs milliers de chapitres).
 */
const props = defineProps<{
  rows: readonly SeriesChapterRow[]
  /** Chapitres affichés (après recherche). */
  shown: number
  /** Chapitre mis en avant : le prochain à lire. */
  nextId?: string
  gaps: readonly ChapterGap[]
  missingCount: number
  /** Titre masqué visuellement (la bascule Volumes / Chapitres le remplace). */
  titleHidden?: boolean
}>()

const query = defineModel<string>('query', { default: '' })

const GROUP_HEIGHT = 40
const ROW_HEIGHT = 60
/** Gaps de numérotation énumérés dans l'alerte avant d'être résumés. */
const GAPS_LISTED = 4

const { t } = useI18n()
const virtualized = computed(() => props.rows.length > VIRTUAL_LIST_THRESHOLD)
const source = computed(() => (virtualized.value ? props.rows : []))
const height = (row?: SeriesChapterRow) => (row?.kind === 'group' ? GROUP_HEIGHT : ROW_HEIGHT)
const { list, containerProps, wrapperProps, scrollTo } = useVirtualList(source, {
  itemHeight: (index) => height(source.value[index]),
  overscan: 12,
})
const visible = computed(() =>
  virtualized.value ? list.value.map((item) => item.data) : props.rows,
)

/** Liste longue : on l'ouvre sur le prochain chapitre ; une recherche remonte en haut. */
function scrollToNext() {
  if (!virtualized.value || query.value) return
  const index = props.rows.findIndex(
    (row) => row.kind === 'chapter' && row.work.id === props.nextId,
  )
  if (index > 2) scrollTo(index - 2)
}
onMounted(() => nextTick(scrollToNext))
watch(query, () => virtualized.value && nextTick(() => scrollTo(0)))

const incomplete = computed(() => {
  const parts = props.gaps.map((gap) =>
    gap.from === gap.to
      ? formatIssueNumber(gap.from)
      : t('work.seriesChapters.range', { from: gap.from, to: gap.to }),
  )
  const list = formatTitleList(
    parts,
    (n) => t('work.seriesChapters.otherGaps', { n }, n),
    GAPS_LISTED,
  )
  return t('work.seriesChapters.incomplete', { list, n: props.missingCount }, props.missingCount)
})
</script>

<template>
  <section aria-labelledby="series-chapters-title" class="flex flex-col gap-3">
    <h2
      id="series-chapters-title"
      :class="titleHidden ? 'sr-only' : 'font-display text-xl font-medium text-highlighted'"
    >
      {{ $t('work.seriesChapters.title') }}
    </h2>

    <UInput
      v-model="query"
      type="search"
      icon="i-lucide-search"
      size="lg"
      :placeholder="$t('work.seriesChapters.searchPlaceholder')"
      :aria-label="$t('work.seriesChapters.searchLabel')"
      class="w-full"
      :ui="{
        base: '[&::-webkit-search-cancel-button]:appearance-none',
        trailing: 'pe-1',
      }"
    >
      <template v-if="query" #trailing>
        <UButton
          icon="i-lucide-x"
          color="neutral"
          variant="link"
          size="sm"
          class="size-9 justify-center"
          :aria-label="$t('work.seriesChapters.clear')"
          @click="query = ''"
        />
      </template>
    </UInput>
    <p v-if="query" class="sr-only" role="status">
      {{ $t('work.seriesChapters.results', { n: shown }, shown) }}
    </p>

    <p v-if="query && shown === 0" class="py-6 text-center text-sm text-muted">
      {{ $t('work.seriesChapters.noResults', { query }) }}
    </p>

    <div
      v-else
      v-bind="virtualized ? containerProps : {}"
      :class="virtualized ? 'h-[min(70vh,44rem)] overscroll-contain border-y border-default' : ''"
    >
      <ol
        v-bind="virtualized ? wrapperProps : {}"
        :aria-label="$t('work.seriesChapters.title')"
        :class="virtualized ? '' : 'border-y border-default'"
      >
        <li
          v-for="row in visible"
          :key="row.key"
          :style="{ height: `${height(row)}px` }"
          :class="row.kind === 'group' ? '' : 'border-b border-default last:border-b-0'"
        >
          <WorkSeriesChapterRow
            :row="row"
            :next="row.kind === 'chapter' && row.work.id === nextId"
          />
        </li>
      </ol>
    </div>

    <UAlert
      v-if="missingCount > 0 && !query"
      color="neutral"
      variant="subtle"
      icon="i-lucide-triangle-alert"
      :description="incomplete"
    />
  </section>
</template>
