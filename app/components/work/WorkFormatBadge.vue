<script setup lang="ts">
import type { FileFormat } from '~/types/core'

/** Format du fichier d'un tome ou d'un chapitre (EPUB, CBZ), sur la fiche d'une série. */
defineProps<{ format: FileFormat }>()
</script>

<template>
  <span
    class="shrink-0 rounded-sm border border-default px-1 py-px font-mono text-[10px] leading-tight tracking-wider text-muted uppercase"
  >
    {{ $t(`format.${format}`) }}
  </span>
</template>
