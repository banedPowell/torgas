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
    class="w-full"
    @update:model-value="emit('update:modelValue', $event as ReadingDirection)"
  />
</template>
