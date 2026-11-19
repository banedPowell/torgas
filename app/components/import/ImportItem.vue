<script setup lang="ts">
import type { ImportEntry } from '~/composables/useImport'

const props = defineProps<{ item: ImportEntry }>()

const { t } = useI18n()

const active = computed(() => ['pending', 'reading', 'importing'].includes(props.item.state))
const percent = computed(() => Math.round(props.item.progress * 100))

type AlertColor = 'neutral' | 'warning' | 'error'
const alert = computed<{ color: AlertColor; icon: string; text: string } | null>(() => {
  switch (props.item.state) {
    case 'duplicate':
      return { color: 'neutral', icon: 'i-lucide-copy', text: t('import.alert.duplicate') }
    case 'drm':
      return { color: 'error', icon: 'i-lucide-lock', text: t('import.alert.drm') }
    case 'unsupported':
      return { color: 'warning', icon: 'i-lucide-file-x', text: t('import.alert.unsupported') }
    case 'error':
      return {
        color: 'error',
        icon: 'i-lucide-circle-alert',
        text: t('import.alert.error', { message: props.item.message ?? '' }),
      }
    default:
      return null
  }
})
</script>

<template>
  <li class="flex flex-col gap-2 rounded-xl border border-default p-3">
    <div class="flex items-baseline justify-between gap-3 text-sm">
      <span class="min-w-0 truncate font-semibold text-highlighted" :title="item.name">
        {{ item.name }}
      </span>
      <span v-if="active" class="shrink-0 font-mono text-[11px] text-toned">{{ percent }} %</span>
    </div>

    <template v-if="active">
      <UProgress
        :model-value="item.state === 'pending' ? 0 : percent"
        size="xs"
        :aria-label="$t('import.progressLabel', { name: item.name })"
      />
      <span class="text-xs text-muted">{{ $t(`import.state.${item.state}`) }}</span>
    </template>

    <p v-else-if="item.state === 'imported'" class="flex flex-wrap gap-x-2 text-xs text-muted">
      <span>{{ $t('import.state.imported') }}</span>
      <ULink
        v-if="item.work"
        :to="`/works/${item.work.id}`"
        class="font-medium text-primary"
        :aria-label="$t('import.open', { title: item.work.title })"
      >
        {{ item.work.title }}
      </ULink>
    </p>

    <span v-else-if="item.state === 'cancelled'" class="text-xs text-dimmed">
      {{ $t('import.state.cancelled') }}
    </span>

    <UAlert
      v-if="alert"
      :color="alert.color"
      variant="subtle"
      :icon="alert.icon"
      :description="alert.text"
      :role="item.state === 'drm' || item.state === 'error' ? 'alert' : undefined"
      :ui="{ root: 'p-2.5', description: 'text-xs leading-snug' }"
    />
  </li>
</template>
