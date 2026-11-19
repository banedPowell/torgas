<script setup lang="ts">
/** Recherche dans la bibliothèque : 44 px sur mobile, 40 px sur desktop (artboards). */
defineProps<{ query: string }>()
const emit = defineEmits<{ 'update:query': [value: string] }>()
</script>

<template>
  <UInput
    :model-value="query"
    type="search"
    icon="i-lucide-search"
    size="lg"
    :placeholder="$t('library.search.placeholder')"
    :aria-label="$t('library.search.label')"
    class="min-w-0"
    :ui="{
      base: 'h-11 rounded-lg border border-default bg-muted text-[15px] placeholder:text-muted hover:bg-muted focus:bg-muted lg:h-10 lg:rounded-[10px] lg:text-sm',
      leadingIcon: 'size-[18px] text-muted lg:size-4',
    }"
    @update:model-value="emit('update:query', String($event ?? ''))"
  />
</template>
