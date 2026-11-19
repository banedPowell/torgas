<script setup lang="ts">
/** Miniature d'une page : l'image n'est demandée qu'une fois la miniature visible. */
const props = defineProps<{
  page: number
  active?: boolean
  resolve: (page: number) => Promise<string>
}>()

defineEmits<{ select: [page: number] }>()

const root = useTemplateRef<HTMLElement>('root')
const src = ref<string>()
const failed = ref(false)

const { stop } = useIntersectionObserver(root, ([entry]) => {
  if (!entry?.isIntersecting) return
  stop()
  props
    .resolve(props.page)
    .then((url) => (src.value = url))
    .catch(() => (failed.value = true))
})
</script>

<template>
  <button
    ref="root"
    type="button"
    :aria-label="$t('reader.comic.goToPage', { page: page + 1 })"
    :aria-current="active ? 'page' : undefined"
    class="relative flex aspect-[2/3] flex-none items-end justify-center overflow-hidden rounded-[3px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
    :class="
      active
        ? 'bg-inverted text-inverted outline-2 outline-offset-1 outline-primary'
        : 'bg-accented text-muted'
    "
    @click="$emit('select', page)"
  >
    <img
      v-if="src && !failed"
      :src="src"
      alt=""
      loading="lazy"
      decoding="async"
      draggable="false"
      class="absolute inset-0 size-full object-cover"
      @error="failed = true"
    />
    <span
      class="relative mb-0.5 rounded-sm px-1 font-mono text-[9px] leading-tight"
      :class="src && !failed && (active ? 'bg-inverted' : 'bg-accented')"
    >
      {{ page + 1 }}
    </span>
  </button>
</template>
