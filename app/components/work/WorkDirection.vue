<script setup lang="ts">
import type { ReadingDirection } from '~/types/core'

defineProps<{
  modelValue: ReadingDirection
  disabled?: boolean
}>()

const emit = defineEmits<{ 'update:modelValue': [value: ReadingDirection] }>()

const { t } = useI18n()

const items = computed(() =>
  (['ltr', 'rtl'] as const).map((value) => ({ value, label: t(`work.direction.${value}`) })),
)
</script>

<template>
  <USelect
    :model-value="modelValue"
    :items="items"
    :disabled="disabled"
    :aria-label="$t('work.direction.label')"
    size="sm"
    class="w-auto"
    :ui="{
      base: 'relative h-7 rounded-sm bg-accented ps-2 pe-7 text-xs text-highlighted before:absolute before:inset-x-0 before:-inset-y-2 before:content-[\'\'] hover:bg-accented',
      trailingIcon: 'size-3.5 text-muted',
    }"
    @update:model-value="emit('update:modelValue', $event as ReadingDirection)"
  />
</template>
