<script setup lang="ts">
const props = defineProps<{
  title: string
  src?: string
}>()

const failed = ref(false)
watch(
  () => props.src,
  () => (failed.value = false),
)

const initials = computed(() =>
  props.title
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase())
    .join(''),
)
</script>

<template>
  <div class="size-full overflow-hidden rounded-sm bg-accented shadow-xs">
    <img
      v-if="src && !failed"
      :src="src"
      :alt="$t('cover.alt', { title })"
      loading="lazy"
      decoding="async"
      class="size-full object-cover"
      @error="failed = true"
    />
    <div
      v-else
      class="flex size-full flex-col justify-end gap-1 bg-linear-to-b from-accented to-elevated p-2"
      aria-hidden="true"
    >
      <span class="font-display text-2xl font-medium text-toned">{{ initials }}</span>
      <span class="line-clamp-3 text-[10px] leading-tight text-muted">{{ title }}</span>
    </div>
  </div>
</template>
