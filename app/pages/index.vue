<script setup lang="ts">
const library = useLibrary()
const {
  entries,
  counts,
  filters,
  sort,
  view,
  state,
  error,
  isEmpty,
  hasActiveFilters,
  virtualized,
} = library

const { t } = useI18n()
useHead({ title: () => `${t('library.title')} · ${t('app.name')}` })
onMounted(library.ensureLoaded)

const showContent = computed(() => state.value === 'ready' && !isEmpty.value)
</script>

<template>
  <UDashboardPanel id="library" class="min-h-0 flex-1" :ui="{ body: 'gap-4 sm:gap-5 lg:px-7' }">
    <template #header>
      <header
        class="flex items-center justify-between gap-3 px-4 pt-5 pb-1 sm:px-6 lg:px-7 lg:pt-6"
      >
        <h1 class="font-display text-3xl font-medium text-highlighted">
          {{ $t('library.title') }}
        </h1>
        <UButton
          icon="i-lucide-plus"
          size="lg"
          disabled
          :aria-label="$t('library.importLabel')"
          :title="$t('library.importSoon')"
          class="size-11 justify-center rounded-full lg:w-auto lg:rounded-md lg:px-4"
        >
          <span class="hidden lg:inline">{{ $t('library.import') }}</span>
        </UButton>
      </header>
    </template>

    <template #body>
      <LibraryFilters
        v-if="showContent"
        :filters="filters"
        :sort="sort"
        :view="view"
        :counts="counts"
        @update:query="library.setQuery"
        @update:format="library.setFormat"
        @update:status="library.setStatus"
        @update:sort="library.setSort"
        @update:view="library.setView"
      />

      <div
        v-if="state === 'idle' || state === 'loading'"
        role="status"
        :aria-label="$t('library.loading')"
        class="grid grid-cols-3 gap-x-3 gap-y-4 sm:grid-cols-[repeat(auto-fill,minmax(132px,1fr))] sm:gap-x-4"
      >
        <div v-for="n in 6" :key="n" class="flex flex-col gap-2">
          <USkeleton class="aspect-[2/3] w-full rounded-sm" />
          <USkeleton class="h-3 w-3/4" />
          <USkeleton class="h-3 w-1/2" />
        </div>
      </div>

      <EmptyState
        v-else-if="state === 'error'"
        icon="i-lucide-circle-alert"
        :title="$t('library.error.title')"
        :description="$t('library.error.description', { message: error })"
      >
        <UButton
          icon="i-lucide-rotate-ccw"
          :label="$t('library.error.action')"
          @click="library.load"
        />
      </EmptyState>

      <EmptyState
        v-else-if="isEmpty"
        :title="$t('library.empty.title')"
        :description="$t('library.empty.description')"
      >
        <UButton icon="i-lucide-upload" :label="$t('library.import')" disabled />
        <p class="w-full text-xs text-dimmed">{{ $t('library.importSoon') }}</p>
      </EmptyState>

      <EmptyState
        v-else-if="entries.length === 0 && hasActiveFilters"
        icon="i-lucide-search-x"
        :title="$t('library.noResults.title')"
        :description="$t('library.noResults.description')"
      >
        <UButton
          color="neutral"
          variant="outline"
          :label="$t('library.noResults.action')"
          @click="library.resetFilters"
        />
      </EmptyState>

      <LibraryGrid v-else-if="view === 'grid'" :entries="entries" :virtualized="virtualized" />
      <LibraryList v-else :entries="entries" :virtualized="virtualized" />
    </template>
  </UDashboardPanel>
</template>
