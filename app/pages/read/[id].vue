<script setup lang="ts">
definePageMeta({ layout: 'reader' })

const route = useRoute()
const router = useRouter()
const id = computed(() => String(route.params.id))
const { work, state, error, load } = useReaderWork(id)

function close() {
  if (window.history.state?.back) router.back()
  else router.push(`/works/${id.value}`)
}

// Les lecteurs EPUB et manga gèrent eux-mêmes Échap (pour ne pas quitter quand un panneau est ouvert).
defineShortcuts(computed(() => (work.value ? {} : { escape: close })))
</script>

<template>
  <div v-if="state === 'loading'" class="flex flex-1 flex-col">
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
  <LazyReaderEpub
    v-else-if="work.format === 'epub'"
    :key="work.id"
    :work-id="work.id"
    @close="close"
  />
  <LazyReaderComic v-else-if="work.format === 'cbz'" :key="work.id" :work="work" @close="close" />
</template>
