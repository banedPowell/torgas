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
    size="sm"
    class="w-30"
    :ui="{
      base: 'relative h-7 w-full rounded-sm bg-accented ps-2 pe-7 text-xs text-highlighted before:absolute before:inset-x-0 before:-inset-y-2 before:content-[\'\'] hover:bg-accented',
      trailingIcon: 'size-3.5 text-muted',
    }"
    @update:model-value="emit('update:modelValue', $event as ReadingStatus)"
  />
</template>
