<script setup lang="ts">
withDefaults(
  defineProps<{
    title: string
    description?: string
    icon?: string
  }>(),
  { description: undefined, icon: 'i-lucide-library' },
)
</script>

<template>
  <section class="mx-auto flex max-w-sm flex-col items-center gap-3 px-4 py-12 text-center">
    <span class="flex size-14 items-center justify-center rounded-full bg-muted text-primary">
      <UIcon :name="icon" class="size-7" aria-hidden="true" />
    </span>
    <h2 class="font-display text-2xl font-medium text-highlighted">{{ title }}</h2>
    <p v-if="description" class="text-sm text-muted">{{ description }}</p>
    <div v-if="$slots.default" class="mt-2 flex flex-wrap justify-center gap-2">
      <slot />
    </div>
  </section>
</template>
