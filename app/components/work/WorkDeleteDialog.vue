<script setup lang="ts">
/**
 * Confirmation de suppression (artboards `FicheOeuvreSuppression` et `BibliothequeSuppression`) :
 * feuille du bas sur mobile, fenêtre modale sur desktop. Pour une œuvre comme pour un lot.
 */
defineProps<{
  title: string
  description: string
  confirmLabel: string
  /** Suppression en cours : bouton en attente, fermeture bloquée. */
  loading?: boolean
}>()

const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ confirm: [] }>()

const isDesktop = useMediaQuery('(min-width: 1024px)')
const UModal = resolveComponent('UModal')
const UDrawer = resolveComponent('UDrawer')

// La modale (desktop) et le tiroir (mobile) n'ont pas les mêmes zones : chacun ses marges.
const modalUi = {
  content: 'max-w-md rounded-2xl',
  header: 'min-h-0 border-none px-6 pt-6 pb-0',
  title: 'font-display text-2xl leading-tight font-medium text-highlighted',
  description: 'mt-3 text-sm leading-normal text-toned',
  footer: 'flex gap-2.5 border-none px-6 pt-6 pb-6',
}
const drawerUi = {
  content: 'rounded-t-3xl',
  container: 'gap-4 px-5 pt-3 pb-[max(1.75rem,env(safe-area-inset-bottom))]',
  header: 'min-h-0 border-none p-0',
  title: 'font-display text-2xl leading-tight font-medium text-highlighted',
  description: 'mt-3 text-sm leading-normal text-toned',
  footer: 'flex gap-2.5 border-none p-0',
}
</script>

<template>
  <component
    :is="isDesktop ? UModal : UDrawer"
    v-model:open="open"
    :title="title"
    :description="description"
    :dismissible="!loading"
    :close="false"
    :ui="isDesktop ? modalUi : drawerUi"
  >
    <template #footer>
      <UButton
        color="neutral"
        variant="outline"
        size="xl"
        block
        :label="$t('deletion.cancel')"
        :disabled="loading"
        class="h-[50px] flex-1 justify-center rounded-[10px] text-[15px] font-semibold"
        @click="open = false"
      />
      <UButton
        color="primary"
        size="xl"
        block
        :label="confirmLabel"
        :loading="loading"
        class="h-[50px] flex-1 justify-center rounded-[10px] text-[15px] font-semibold"
        @click="emit('confirm')"
      />
    </template>
  </component>
</template>
