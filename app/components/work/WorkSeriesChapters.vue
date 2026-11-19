<script setup lang="ts">
import type { SeriesChapterRow } from '~/types/work'
import type { ChapterGap } from '~/utils/seriesChapters'
import type { Rect, Virtualizer } from '@tanstack/vue-virtual'
import { observeElementRect, useVirtualizer } from '@tanstack/vue-virtual'

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
const height = (row?: SeriesChapterRow) => (row?.kind === 'group' ? GROUP_HEIGHT : ROW_HEIGHT)

// Liste longue : virtualisée dans le défilement de la page (pas de cadre qui défile à part).
// `scrollMargin` situe le haut de la liste dans le conteneur qui défile.
const listEl = useTemplateRef<HTMLElement>('list')
const scroller = shallowRef<HTMLElement | null>(null)
const scrollMargin = ref(0)

function scrollParent(el: HTMLElement | null): HTMLElement {
  for (let node = el?.parentElement; node; node = node.parentElement) {
    const { overflowY } = getComputedStyle(node)
    if (overflowY === 'auto' || overflowY === 'scroll') return node
  }
  return document.documentElement
}

function measure() {
  const el = listEl.value
  if (!el || !scroller.value) return
  const top =
    el.getBoundingClientRect().top -
    scroller.value.getBoundingClientRect().top +
    scroller.value.scrollTop
  if (Math.abs(top - scrollMargin.value) > 0.5) scrollMargin.value = top
}

watch(
  [virtualized, listEl],
  ([on, el]) => {
    scroller.value = on && el ? scrollParent(el) : null
    measure()
  },
  { flush: 'post' },
)
// Ce qui précède la liste (en-tête, recherche, alerte) peut changer de hauteur.
useEventListener(scroller, 'scroll', measure, { passive: true })
useResizeObserver(scroller, measure)

const virtualizer = useVirtualizer(
  computed(() => {
    const el = scroller.value
    return {
      count: virtualized.value ? props.rows.length : 0,
      getScrollElement: () => el,
      estimateSize: (index: number) => height(props.rows[index]),
      overscan: 12,
      scrollMargin: scrollMargin.value,
      // Conteneur pas encore mesuré (ou sans mise en page, dans les tests) : hauteur de l'écran.
      observeElementRect: (instance: Virtualizer<HTMLElement, Element>, cb: (rect: Rect) => void) =>
        observeElementRect(instance, (rect) =>
          cb(rect.height > 0 ? rect : { width: rect.width, height: window.innerHeight }),
        ),
    }
  }),
)
const visible = computed(() => {
  if (!virtualized.value) return props.rows
  return virtualizer.value
    .getVirtualItems()
    .map((item) => props.rows[item.index])
    .filter((row): row is SeriesChapterRow => !!row)
})
/** Espace des lignes non rendues, au-dessus et au-dessous de la fenêtre. */
const padding = computed(() => {
  if (!virtualized.value) return {}
  const items = virtualizer.value.getVirtualItems()
  const total = virtualizer.value.getTotalSize()
  const first = items[0]
  const last = items.at(-1)
  return {
    paddingTop: `${first ? first.start - scrollMargin.value : 0}px`,
    paddingBottom: `${last ? total - (last.end - scrollMargin.value) : total}px`,
  }
})

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

    <ol
      v-else
      ref="list"
      :aria-label="$t('work.seriesChapters.title')"
      :style="padding"
      class="border-y border-default"
    >
      <li
        v-for="row in visible"
        :key="row.key"
        :style="{ height: `${height(row)}px` }"
        :class="row.kind === 'group' ? '' : 'border-b border-default last:border-b-0'"
      >
        <WorkSeriesChapterRow :row="row" :next="row.kind === 'chapter' && row.work.id === nextId" />
      </li>
    </ol>

    <UAlert
      v-if="missingCount > 0 && !query"
      color="neutral"
      variant="subtle"
      icon="i-lucide-triangle-alert"
      :description="incomplete"
    />
  </section>
</template>
