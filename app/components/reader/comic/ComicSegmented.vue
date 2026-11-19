<script setup lang="ts" generic="T extends string">
/** Choix exclusif en boutons segmentés (mode de lecture, sens, ajustement). */
defineProps<{
  label: string
  options: { value: T; label: string }[]
}>()

const model = defineModel<T>({ required: true })
</script>

<template>
  <div
    role="group"
    :aria-label="label"
    class="grid gap-1 rounded-xl bg-muted p-1"
    :class="options.length > 3 ? 'grid-cols-2' : 'auto-cols-fr grid-flow-col'"
  >
    <button
      v-for="option in options"
      :key="option.value"
      type="button"
      :aria-pressed="model === option.value"
      class="h-10 min-w-0 truncate rounded-[9px] px-2 text-[13px] transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-primary"
      :class="
        model === option.value
          ? 'bg-default font-semibold text-highlighted'
          : 'text-muted hover:text-default'
      "
      @click="model = option.value"
    >
      {{ option.label }}
    </button>
  </div>
</template>
