<script setup lang="ts">
definePageMeta({ layout: 'reader' })

const route = useRoute()
const router = useRouter()
const id = computed(() => String(route.params.id))
const { work, state, error, load } = useReaderWork(id)

// Ouverture à un chapitre précis depuis la fiche (`?at=<cible foliate>`), une seule fois.
const startAt = computed(() => (typeof route.query.at === 'string' ? route.query.at : undefined))
// Ouverture d'un volume à la première page d'un chapitre (`?page=<n>`, à partir de 0).
const startPage = computed(() => {
  const page = Number(route.query.page)
  return typeof route.query.page === 'string' && Number.isInteger(page) && page >= 0
    ? page
    : undefined
})

// Manga en EPUB fait de pages-images : lecteur de planches, comme un CBZ. Un manga importé
// avant que ses pages soient comptées les fait compter (0 : il reste lu comme un livre).
const core = useCore()
const comicPages = ref<number | null>(null)
watch(
  work,
  async (w) => {
    comicPages.value = null
    if (w?.format !== 'epub' || w.kind !== 'comic') return
    comicPages.value = w.pageCount ?? (await core.getPageCount(w.id).catch(() => 0))
  },
  { immediate: true },
)
const comicEpub = computed(() => work.value?.format === 'epub' && work.value.kind === 'comic')
const asComic = computed(
  () => work.value?.format === 'cbz' || (comicEpub.value && (comicPages.value ?? 0) > 0),
)

function close() {
  if (window.history.state?.back) router.back()
  else router.push(`/works/${id.value}`)
}

// Les lecteurs EPUB et manga gèrent eux-mêmes Échap (pour ne pas quitter quand un panneau est ouvert).
defineShortcuts(computed(() => (work.value ? {} : { escape: close })))
</script>

<template>
  <div
    v-if="state === 'loading' || (comicEpub && comicPages === null)"
    class="flex flex-1 flex-col"
  >
    <ReaderSkeleton />
  </div>
  <div v-else-if="state === 'error'" class="flex flex-1 items-center justify-center">
    <EmptyState
      icon="i-lucide-book-x"
      :title="$t('reader.loadError.title')"
      :description="$t('reader.loadError.description', { message: error })"
    >
      <UButton icon="i-lucide-rotate-cw" :label="$t('reader.loadError.retry')" @click="load()" />
      <UButton
        icon="i-lucide-library"
        color="neutral"
        variant="outline"
        :label="$t('reader.back')"
        to="/"
      />
    </EmptyState>
  </div>
  <div v-else-if="!work" class="flex flex-1 items-center justify-center">
    <EmptyState
      icon="i-lucide-book-x"
      :title="$t('reader.notFound.title')"
      :description="$t('reader.notFound.description')"
    >
      <UButton icon="i-lucide-library" :label="$t('reader.back')" to="/" />
    </EmptyState>
  </div>
  <LazyReaderComic
    v-else-if="asComic"
    :key="work.id"
    :work="work"
    :start-page="startPage"
    @close="close"
  />
  <LazyReaderEpub
    v-else-if="work.format === 'epub'"
    :key="work.id"
    :work-id="work.id"
    :start-at="startAt"
    @close="close"
  />
</template>
