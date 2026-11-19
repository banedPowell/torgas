<script setup lang="ts">
/** Bandeau « Import en cours » (artboard `Bibliotheque`) : fichier courant et progression globale. */
defineProps<{
  name?: string
  /** Progression globale, de 0 à 1. */
  progress: number
  done: number
  total: number
}>()
const emit = defineEmits<{ cancel: [] }>()
</script>

<template>
  <div
    role="status"
    class="flex items-center gap-3 rounded-lg border border-default bg-muted py-2.5 ps-3 pe-1"
  >
    <UIcon name="i-lucide-download" class="size-[18px] shrink-0 text-primary" aria-hidden="true" />
    <div class="flex min-w-0 flex-1 flex-col gap-1.5">
      <span class="truncate text-[13px]">
        <strong>{{ $t('import.running') }}</strong>
        <template v-if="name"> · {{ name }}</template>
      </span>
      <UProgress
        :model-value="Math.round(progress * 100)"
        size="xs"
        :aria-label="$t('import.globalLabel')"
      />
    </div>
    <span class="shrink-0 font-mono text-[11px] text-muted">
      {{ $t('import.counter', { done, total }) }}
    </span>
    <UButton
      color="neutral"
      variant="ghost"
      icon="i-lucide-x"
      :aria-label="$t('import.cancel')"
      class="size-11 shrink-0 justify-center"
      @click="emit('cancel')"
    />
  </div>
</template>
