<script setup lang="ts">
import type { ImportEntry } from '~/composables/useImport'

/**
 * Panneau d'import : Slideover à droite sur desktop, Drawer depuis le bas sur mobile. Contient
 * la zone de dépôt (ou de choix des fichiers) et la file d'import avec ses résultats.
 */
defineProps<{
  items: readonly ImportEntry[]
  running: boolean
}>()
const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ files: [files: File[]]; cancel: []; clear: [] }>()

const isDesktop = useMediaQuery('(min-width: 1024px)')
const { t } = useI18n()
const description = computed(() => t('import.panelDescription'))
</script>

<template>
  <USlideover
    v-if="isDesktop"
    v-model:open="open"
    side="right"
    :title="$t('import.title')"
    :description="description"
    :ui="{
      content: 'max-w-[380px] bg-muted',
      header: 'border-none px-6 pt-6 pb-2',
      title: 'font-display text-[22px] font-medium text-highlighted',
      description: 'sr-only',
      body: 'px-6 pt-2 pb-6',
    }"
  >
    <template #body>
      <ImportQueue
        :items="items"
        :running="running"
        :heading="false"
        @files="emit('files', $event)"
        @cancel="emit('cancel')"
        @clear="emit('clear')"
      />
    </template>
  </USlideover>
  <UDrawer
    v-else
    v-model:open="open"
    :title="$t('import.title')"
    :description="description"
    :ui="{
      header: 'px-5 pt-1',
      title: 'font-display text-[22px] font-medium text-highlighted',
      description: 'sr-only',
      body: 'max-h-[70dvh] overflow-y-auto px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))]',
    }"
  >
    <template #body>
      <ImportQueue
        :items="items"
        :running="running"
        :heading="false"
        @files="emit('files', $event)"
        @cancel="emit('cancel')"
        @clear="emit('clear')"
      />
    </template>
  </UDrawer>
</template>
