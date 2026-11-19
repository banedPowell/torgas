<script setup lang="ts">
import type { ImportEntry } from '~/composables/useImport'

/** Panneau d'import (artboard `DesktopBibliotheque`) : dépôt, fichiers et leurs résultats. */
withDefaults(
  defineProps<{
    items: readonly ImportEntry[]
    running: boolean
    dropzone?: boolean
    /** Titre « Import » et compteur (absents quand le conteneur porte déjà le titre). */
    heading?: boolean
  }>(),
  { dropzone: true, heading: true },
)
const emit = defineEmits<{ files: [files: File[]]; cancel: []; clear: [] }>()
</script>

<template>
  <section :aria-label="$t('import.title')" class="flex flex-col gap-3.5">
    <div v-if="heading" class="flex items-center justify-between gap-3">
      <h2 class="font-display text-[22px] font-medium text-highlighted">
        {{ $t('import.title') }}
      </h2>
      <span v-if="items.length" class="font-mono text-[11px] text-muted">
        {{ $t('import.files', { n: items.length }, items.length) }}
      </span>
    </div>

    <p v-if="!heading && items.length" class="font-mono text-[11px] text-muted">
      {{ $t('import.files', { n: items.length }, items.length) }}
    </p>

    <ImportDropzone v-if="dropzone" variant="inline" @files="emit('files', $event)" />

    <ul v-if="items.length" class="flex flex-col gap-2.5" aria-live="polite">
      <ImportItem v-for="item in items" :key="item.id" :item="item" />
    </ul>

    <div v-if="items.length" class="flex flex-wrap justify-end gap-2">
      <UButton
        v-if="running"
        color="neutral"
        variant="outline"
        icon="i-lucide-circle-stop"
        :label="$t('import.cancel')"
        class="min-h-11"
        @click="emit('cancel')"
      />
      <UButton
        v-else
        color="neutral"
        variant="ghost"
        icon="i-lucide-list-x"
        :label="$t('import.clear')"
        class="min-h-11"
        @click="emit('clear')"
      />
    </div>
  </section>
</template>
