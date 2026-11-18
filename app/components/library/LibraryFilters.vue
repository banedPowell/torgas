<script setup lang="ts">
import type { ReadingStatus } from '~/types/core'
import type {
  FormatFilter,
  LibraryFilters,
  LibrarySort,
  LibraryView,
  StatusFilter,
} from '~/types/library'

defineProps<{
  filters: Readonly<LibraryFilters>
  sort: LibrarySort
  view: LibraryView
  counts: Readonly<Record<ReadingStatus | 'all', number>>
}>()

const emit = defineEmits<{
  'update:query': [value: string]
  'update:format': [value: FormatFilter]
  'update:status': [value: StatusFilter]
  'update:sort': [value: LibrarySort]
  'update:view': [value: LibraryView]
}>()

const { t } = useI18n()

const STATUSES: StatusFilter[] = ['all', 'reading', 'to_read', 'finished', 'paused', 'abandoned']
const FORMATS: FormatFilter[] = ['all', 'epub', 'cbz']
const SORTS: LibrarySort[] = ['lastRead', 'added', 'title']

const formatItems = computed(() =>
  FORMATS.map((value) => ({ value, label: t(`library.formatFilter.${value}`) })),
)
const sortItems = computed(() =>
  SORTS.map((value) => ({ value, label: t(`library.sort.${value}`) })),
)
const viewButtons: { value: LibraryView; icon: string }[] = [
  { value: 'grid', icon: 'i-lucide-layout-grid' },
  { value: 'list', icon: 'i-lucide-list' },
]
</script>

<template>
  <div class="flex flex-col gap-3">
    <div class="flex flex-wrap items-center gap-2 lg:flex-nowrap lg:gap-3">
      <UInput
        :model-value="filters.query"
        type="search"
        icon="i-lucide-search"
        size="lg"
        :placeholder="$t('library.search.placeholder')"
        :aria-label="$t('library.search.label')"
        class="min-w-0 flex-1 lg:w-72 lg:flex-none"
        @update:model-value="emit('update:query', String($event ?? ''))"
      />
      <!-- Mobile : les listes passent sous la recherche pour que leurs libellés tiennent en entier. -->
      <div
        class="order-3 grid w-full grid-cols-[2fr_3fr] gap-2 lg:order-2 lg:ms-auto lg:flex lg:w-auto"
      >
        <USelect
          :model-value="filters.format"
          :items="formatItems"
          icon="i-lucide-file-text"
          :aria-label="$t('library.formatFilter.label')"
          class="min-w-0 lg:w-40"
          @update:model-value="emit('update:format', $event as FormatFilter)"
        />
        <USelect
          :model-value="sort"
          :items="sortItems"
          icon="i-lucide-arrow-down-up"
          :aria-label="$t('library.sort.label')"
          class="min-w-0 lg:w-48"
          @update:model-value="emit('update:sort', $event as LibrarySort)"
        />
      </div>
      <UFieldGroup :aria-label="$t('library.view.label')" class="order-2 lg:order-3">
        <UButton
          v-for="button in viewButtons"
          :key="button.value"
          :icon="button.icon"
          color="neutral"
          :variant="view === button.value ? 'soft' : 'ghost'"
          :aria-label="$t(`library.view.${button.value}`)"
          :aria-pressed="view === button.value"
          class="size-10 justify-center"
          @click="emit('update:view', button.value)"
        />
      </UFieldGroup>
    </div>

    <div
      role="group"
      :aria-label="$t('library.statusFilter')"
      class="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1"
    >
      <UButton
        v-for="status in STATUSES"
        :key="status"
        color="neutral"
        :variant="filters.status === status ? 'solid' : 'outline'"
        :aria-pressed="filters.status === status"
        class="h-9 shrink-0 rounded-full px-3.5"
        @click="emit('update:status', status)"
      >
        {{ $t(`status.${status}`) }}
        <span class="font-mono text-xs opacity-70">· {{ counts[status] }}</span>
      </UButton>
    </div>
  </div>
</template>
