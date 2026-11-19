<script setup lang="ts">
import type { Work } from '~/types/core'

/** Bouton « … » d'un volume ou d'un chapitre de la série : lire, supprimer ce fichier seul. */
const props = defineProps<{ work: Work; label: string }>()
const emit = defineEmits<{ remove: [work: Work] }>()

const itemMenu = useWorkItemMenu()
const items = computed(() => itemMenu(props.work, () => emit('remove', props.work)))
</script>

<template>
  <UDropdownMenu
    :items="items"
    :content="{ align: 'end', sideOffset: 4 }"
    :ui="{
      content: 'min-w-56 rounded-[14px] p-1.5',
      item: 'min-h-[42px] items-center rounded-[9px] px-2.5 py-2 text-sm font-semibold data-highlighted:before:bg-primary/10',
      itemLabel: 'whitespace-nowrap',
    }"
  >
    <UTooltip :text="$t('deletion.itemMenu', { label })">
      <UButton
        icon="i-lucide-ellipsis"
        color="neutral"
        variant="ghost"
        :aria-label="$t('deletion.itemMenu', { label })"
        class="size-10 shrink-0 justify-center rounded-full data-[state=open]:bg-accented"
      />
    </UTooltip>
  </UDropdownMenu>
</template>
