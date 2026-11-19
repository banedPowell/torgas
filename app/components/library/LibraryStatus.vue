<script setup lang="ts">
import type { TabsItem } from '@nuxt/ui'
import type { ReadingStatus } from '~/types/core'
import type { StatusFilter } from '~/types/library'

/**
 * Filtre par statut. Mobile : pastilles de 36 px (zone de clic de 44 px), la sélectionnée
 * en inversé ; desktop : onglets soulignés (artboards `Bibliotheque` et `DesktopBibliotheque`).
 */
const props = defineProps<{
  status: StatusFilter
  counts: Readonly<Record<ReadingStatus | 'all', number>>
  desktop?: boolean
}>()
const emit = defineEmits<{ 'update:status': [value: StatusFilter] }>()

const { t } = useI18n()
const STATUSES: StatusFilter[] = ['all', 'reading', 'to_read', 'finished', 'paused', 'abandoned']
const label = (status: StatusFilter) => `${t(`status.${status}`)} · ${props.counts[status]}`

const tabs = computed<TabsItem[]>(() => STATUSES.map((value) => ({ value, label: label(value) })))
const current = computed({
  get: () => props.status,
  set: (value: StatusFilter) => emit('update:status', value),
})
</script>

<template>
  <UTabs
    v-if="desktop"
    v-model="current"
    :items="tabs"
    :content="false"
    variant="link"
    :aria-label="$t('library.statusFilter')"
    :ui="{ list: 'gap-5', trigger: 'min-h-11 px-0 text-sm' }"
  />
  <div
    v-else
    role="group"
    :aria-label="$t('library.statusFilter')"
    class="-mx-1 flex gap-1.5 overflow-x-auto px-1 py-1 [scrollbar-width:none]"
  >
    <UButton
      v-for="value in STATUSES"
      :key="value"
      color="neutral"
      :variant="status === value ? 'solid' : 'outline'"
      :aria-pressed="status === value"
      :class="[
        'relative h-9 shrink-0 rounded-full px-3.5 text-[13px] before:absolute before:inset-x-0 before:-inset-y-1 before:content-[\'\']',
        status === value ? 'font-semibold' : 'font-normal text-default ring-default',
      ]"
      :label="label(value)"
      @click="emit('update:status', value)"
    />
  </div>
</template>
