<script setup lang="ts">
definePageMeta({ layout: 'reader' })

const route = useRoute()
const router = useRouter()
const id = computed(() => String(route.params.id))
const { work, state } = useWork(id)

function close() {
  if (window.history.state?.back) router.back()
  else router.push(`/works/${id.value}`)
}

// Les lecteurs EPUB et manga gèrent eux-mêmes Échap (pour ne pas quitter quand un panneau est ouvert).
defineShortcuts(computed(() => (work.value ? {} : { escape: close })))
</script>

<template>
  <div v-if="state === 'idle' || state === 'loading'" class="flex flex-1 flex-col">
    <ReaderSkeleton />
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
  <LazyReaderEpub v-else-if="work.format === 'epub'" :work-id="work.id" @close="close" />
  <LazyReaderComic v-else-if="work.format === 'cbz'" :work="work" @close="close" />
</template>
