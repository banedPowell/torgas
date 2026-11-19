<script setup lang="ts">
import type { LibraryEntry } from '~/types/library'

/**
 * Barre du mode sélection (artboard `BibliothequeSuppression`), à la place de « Reprendre » :
 * nombre d'œuvres cochées, suppression du lot après confirmation, sortie du mode.
 */
const props = defineProps<{
  /** Entrées cochées (œuvres ou séries), dans l'ordre de sélection. */
  entries: readonly LibraryEntry[]
  /** Nombre d'œuvres supprimées (une série compte pour ses volumes). */
  count: number
  deleting?: boolean
}>()

const emit = defineEmits<{ close: []; confirm: [] }>()

const { t } = useI18n()
const confirming = ref(false)

const titles = computed(() =>
  props.entries.map((e) =>
    e.kind === 'work'
      ? e.work.title
      : t('deletion.seriesItem', { title: e.series.title, n: e.works.length }),
  ),
)
const description = computed(() =>
  t(
    'deletion.batchDescription',
    { list: formatTitleList(titles.value, (n) => t('deletion.others', { n })) },
    props.entries.length,
  ),
)

// Le lot supprimé (ou vidé), la confirmation se referme.
watch(
  () => props.count,
  (count) => {
    if (count === 0) confirming.value = false
  },
)
</script>

<template>
  <div
    role="toolbar"
    :aria-label="$t('library.selection.toolbar')"
    class="flex items-center gap-2 rounded-[14px] bg-inverted py-2 ps-3.5 pe-2 text-inverted"
  >
    <span class="flex-1 text-sm font-semibold" aria-live="polite">
      {{ $t('library.selection.count', count) }}
    </span>
    <UButton
      color="primary"
      :label="$t('library.selection.delete')"
      :disabled="count === 0"
      class="h-10 rounded-[10px] px-3 text-[13px] font-semibold"
      @click="confirming = true"
    />
    <UTooltip :text="$t('library.selection.close')">
      <UButton
        icon="i-lucide-x"
        color="neutral"
        variant="ghost"
        :aria-label="$t('library.selection.close')"
        class="size-11 shrink-0 justify-center rounded-full text-inverted hover:bg-accented/20"
        @click="emit('close')"
      />
    </UTooltip>
    <WorkDeleteDialog
      v-model:open="confirming"
      :title="$t('deletion.batchTitle', { n: count }, count)"
      :description="description"
      :confirm-label="$t('deletion.confirmMany', { n: count }, count)"
      :loading="deleting"
      @confirm="emit('confirm')"
    />
  </div>
</template>
