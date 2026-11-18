<script setup lang="ts">
import type { ReadingStatus } from '~/types/core'

defineProps<{
  modelValue: ReadingStatus
  disabled?: boolean
}>()

const emit = defineEmits<{ 'update:modelValue': [value: ReadingStatus] }>()

const { t } = useI18n()

const STATUSES: ReadingStatus[] = ['to_read', 'reading', 'paused', 'finished', 'abandoned']
const items = computed(() => STATUSES.map((value) => ({ value, label: t(`status.${value}`) })))
</script>

<template>
  <USelectMenu
    :model-value="modelValue"
    :items="items"
    value-key="value"
    :search-input="false"
    :disabled="disabled"
    :aria-label="$t('work.status.label')"
    class="w-full"
    @update:model-value="emit('update:modelValue', $event as ReadingStatus)"
  />
</template>
