<script setup lang="ts">
// Liste d'entrées du sommaire (chapitres ou notes), indentée selon la profondeur.
import type { ReaderTocEntry } from '~/types/reader'

defineProps<{
  entries: readonly ReaderTocEntry[]
  currentHref?: string
  label: string
}>()

const emit = defineEmits<{ navigate: [href: string] }>()
</script>

<template>
  <nav :aria-label="label">
    <ul class="flex flex-col">
      <li v-for="entry in entries" :key="entry.href">
        <button
          type="button"
          class="flex min-h-11 w-full items-center rounded-md px-3 py-2 text-start text-sm hover:bg-elevated focus-visible:outline-2 focus-visible:outline-primary"
          :class="entry.href === currentHref ? 'font-semibold text-primary' : 'text-default'"
          :style="{ paddingInlineStart: `${0.75 + entry.depth}rem` }"
          :aria-current="entry.href === currentHref ? 'location' : undefined"
          @click="emit('navigate', entry.href)"
        >
          {{ entry.label }}
        </button>
      </li>
    </ul>
  </nav>
</template>
