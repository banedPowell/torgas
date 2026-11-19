<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'

/**
 * Menu « Plus d'actions » de la fiche (artboard `FicheOeuvre`). Phase 0 : seule la suppression
 * existe ; les autres actions de la maquette (métadonnées, collection, possession) viendront.
 */
defineProps<{ disabled?: boolean }>()
const emit = defineEmits<{ delete: [] }>()

const { t } = useI18n()

const items = computed<DropdownMenuItem[]>(() => [
  {
    label: t('deletion.action'),
    icon: 'i-lucide-trash-2',
    color: 'primary',
    onSelect: () => emit('delete'),
  },
])
</script>

<template>
  <UDropdownMenu
    :items="items"
    :content="{ align: 'end', sideOffset: 4 }"
    :ui="{
      content: 'min-w-60 rounded-[14px] p-1.5',
      item: 'min-h-[42px] items-center rounded-[9px] px-2.5 py-2 text-sm font-semibold data-highlighted:before:bg-primary/10',
      itemLabel: 'whitespace-nowrap',
    }"
  >
    <UTooltip :text="$t('deletion.menu')">
      <UButton
        icon="i-lucide-ellipsis"
        color="neutral"
        variant="ghost"
        size="xl"
        :disabled="disabled"
        :aria-label="$t('deletion.menu')"
        class="size-11 justify-center rounded-full data-[state=open]:bg-accented"
      />
    </UTooltip>
  </UDropdownMenu>
</template>
