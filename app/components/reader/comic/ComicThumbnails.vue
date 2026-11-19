<script setup lang="ts">
/** Toutes les pages du volume en miniatures, chargées à mesure qu'elles apparaissent. */
const props = defineProps<{
  page: number
  pageCount: number
  resolve: (page: number) => Promise<string>
}>()

const emit = defineEmits<{ select: [page: number] }>()
const open = defineModel<boolean>('open', { default: false })

const grid = useTemplateRef<HTMLElement>('grid')

watch(open, async (value) => {
  if (!value) return
  await nextTick()
  grid.value
    ?.querySelector('[aria-current="page"]')
    ?.scrollIntoView({ block: 'center', behavior: 'instant' })
})

function select(page: number) {
  emit('select', page)
  open.value = false
}
</script>

<template>
  <USlideover v-model:open="open" :title="$t('reader.comic.thumbnails')" side="right">
    <template #body>
      <div ref="grid" class="grid grid-cols-3 gap-3 sm:grid-cols-4">
        <ComicThumb
          v-for="index in props.pageCount"
          :key="index - 1"
          :page="index - 1"
          :active="index - 1 === props.page"
          :resolve="resolve"
          class="w-full"
          @select="select"
        />
      </div>
    </template>
  </USlideover>
</template>
