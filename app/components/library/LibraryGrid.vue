<script setup lang="ts">
import type { ContextMenuItem } from '@nuxt/ui'
import type { LibraryEntry } from '~/types/library'

const props = defineProps<{
  entries: readonly LibraryEntry[]
  /** Liste virtualisée (au-delà de VIRTUAL_LIST_THRESHOLD entrées). */
  virtualized?: boolean
  /** Mode sélection : les cartes se cochent (identifiants d'entrée cochés dans `selected`). */
  selecting?: boolean
  selected?: ReadonlySet<string>
  /** Menu contextuel de chaque entrée. */
  menuFor?: (entry: LibraryEntry) => ContextMenuItem[][]
}>()

const emit = defineEmits<{ toggle: [id: string] }>()

const MIN_CARD = 132
const GAP_X = 18
const GAP_Y = 22
/** Hauteur du texte et de la barre de progression sous la couverture. */
const CAPTION = 64

const root = useTemplateRef<HTMLElement>('root')
const { width } = useElementSize(root)

const columns = computed(() =>
  width.value < 640 ? 3 : Math.max(3, Math.floor((width.value + GAP_X) / (MIN_CARD + GAP_X))),
)
const rowHeight = computed(() => {
  const card = (width.value - GAP_X * (columns.value - 1)) / columns.value
  return Math.max(1, Math.round(card * 1.5 + CAPTION + GAP_Y))
})
const rows = computed(() => {
  if (!props.virtualized) return []
  const result: LibraryEntry[][] = []
  for (let i = 0; i < props.entries.length; i += columns.value) {
    result.push(props.entries.slice(i, i + columns.value))
  }
  return result
})

const { list, containerProps, wrapperProps } = useVirtualList(rows, {
  itemHeight: () => rowHeight.value,
  overscan: 3,
})
</script>

<template>
  <div ref="root" :class="virtualized ? 'flex min-h-0 flex-1 flex-col' : ''">
    <div v-if="virtualized" v-bind="containerProps" class="min-h-0 flex-1">
      <ul v-bind="wrapperProps">
        <li
          v-for="row in list"
          :key="row.index"
          class="grid gap-x-[18px]"
          :style="{
            height: `${rowHeight}px`,
            gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
          }"
        >
          <WorkCard
            v-for="entry in row.data"
            :key="entry.id"
            :entry="entry"
            :menu="menuFor?.(entry)"
            :selectable="selecting"
            :selected="selected?.has(entry.id)"
            @toggle="emit('toggle', $event)"
          />
        </li>
      </ul>
    </div>
    <ul
      v-else
      class="grid grid-cols-3 gap-x-3 gap-y-4 sm:grid-cols-[repeat(auto-fill,minmax(132px,1fr))] sm:gap-x-[18px] sm:gap-y-[22px]"
    >
      <li v-for="entry in entries" :key="entry.id">
        <WorkCard
          :entry="entry"
          :menu="menuFor?.(entry)"
          :selectable="selecting"
          :selected="selected?.has(entry.id)"
          @toggle="emit('toggle', $event)"
        />
      </li>
    </ul>
  </div>
</template>
