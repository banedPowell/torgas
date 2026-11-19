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

const importer = useImport()
const { items: importItems, running: importing, current, progress, done, total } = importer
const dropzone = useTemplateRef('dropzone')
// Desktop : fichiers déposés sur la fenêtre ou ouverts par association.
const { hovering } = useTauriFileDrop(importer.add)
// Desktop : panneau latéral d'import ; mobile : bandeau puis résultats au-dessus de la grille.
const isDesktop = useMediaQuery('(min-width: 1024px)')

function openPicker() {
  dropzone.value?.open()
}
</script>

<template>
  <div class="flex min-h-0 min-w-0 flex-1">
    <UDashboardPanel
      id="library"
      class="min-h-0 flex-1"
      :ui="{ body: 'gap-3 sm:gap-4 lg:gap-5 lg:px-7' }"
    >
      <template #header>
        <header
          class="flex flex-wrap items-center gap-x-3 gap-y-3 px-5 pt-5 pb-2 lg:px-7 lg:pt-6 lg:pb-0"
        >
          <h1 class="me-auto font-display text-3xl font-medium text-highlighted">
            {{ $t('library.title') }}
          </h1>
          <div v-if="isDesktop && showContent" class="order-last flex w-full items-center gap-3">
            <LibrarySearch
              :query="filters.query"
              class="max-w-72 min-w-48 flex-1"
              @update:query="library.setQuery"
            />
            <LibraryOptions
              desktop
              class="ms-auto"
              :format="filters.format"
              :sort="sort"
              :view="view"
              @update:format="library.setFormat"
              @update:sort="library.setSort"
              @update:view="library.setView"
            />
          </div>
          <UButton
            icon="i-lucide-plus"
            size="lg"
            :aria-label="$t('library.importLabel')"
            class="size-11 justify-center rounded-full lg:h-10 lg:w-auto lg:rounded-[10px] lg:px-4"
            @click="openPicker"
          >
            <span class="hidden font-semibold lg:inline">{{ $t('library.import') }}</span>
          </UButton>
        </header>
      </template>

      <template #body>
        <template v-if="!isDesktop">
          <ImportStatusBar
            v-if="importing"
            :name="current?.name"
            :progress="progress"
            :done="done"
            :total="total"
            @cancel="importer.cancel"
          />
          <ImportQueue
            v-else-if="importItems.length"
            :items="importItems"
            :running="importing"
            :dropzone="false"
            @clear="importer.clear"
          />
        </template>

        <template v-if="showContent">
          <LibrarySearch
            v-if="!isDesktop"
            :query="filters.query"
            @update:query="library.setQuery"
          />
          <LibraryStatus
            :status="filters.status"
            :counts="counts"
            :desktop="isDesktop"
            @update:status="library.setStatus"
          />
          <LibraryOptions
            v-if="!isDesktop"
            :format="filters.format"
            :sort="sort"
            :view="view"
            @update:format="library.setFormat"
            @update:sort="library.setSort"
            @update:view="library.setView"
          />
        </template>

        <div
          v-if="state === 'idle' || state === 'loading'"
          role="status"
          :aria-label="$t('library.loading')"
          class="grid grid-cols-3 gap-x-3 gap-y-4 sm:grid-cols-[repeat(auto-fill,minmax(132px,1fr))] sm:gap-x-[18px]"
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
          <UButton icon="i-lucide-upload" :label="$t('library.import')" @click="openPicker" />
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

    <aside
      v-if="isDesktop"
      class="w-[340px] shrink-0 overflow-y-auto border-s border-default bg-muted px-5 py-6"
    >
      <ImportQueue
        :items="importItems"
        :running="importing"
        @files="importer.add"
        @cancel="importer.cancel"
        @clear="importer.clear"
      />
    </aside>

    <ImportDropzone ref="dropzone" :hovering="hovering" @files="importer.add" />
  </div>
</template>
