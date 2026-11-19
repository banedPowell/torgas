<script setup lang="ts">
import type { ComicLayout } from '~/utils/comic'

/** Barre du haut : retour, titre, accès aux miniatures et aux réglages, mode de lecture. */
defineProps<{
  title: string
  subtitle?: string
}>()

defineEmits<{ close: []; settings: []; thumbnails: [] }>()

const layout = defineModel<ComicLayout>('layout', { required: true })

const { t } = useI18n()
const layouts = computed(() =>
  (['single', 'double', 'webtoon'] as const).map((value) => ({
    value,
    label: t(`reader.comic.layout.${value}`),
  })),
)
</script>

<template>
  <div class="flex flex-col gap-2 bg-muted/95 px-2 pt-3.5 pb-3 backdrop-blur-sm">
    <header class="flex items-center gap-1">
      <UTooltip :text="$t('reader.comic.close')">
        <UButton
          icon="i-lucide-chevron-left"
          color="neutral"
          variant="ghost"
          size="xl"
          square
          class="size-11 justify-center"
          :aria-label="$t('reader.comic.close')"
          @click="$emit('close')"
        />
      </UTooltip>
      <div class="flex min-w-0 flex-1 flex-col gap-px">
        <h1 class="truncate text-sm font-semibold text-default">{{ title }}</h1>
        <p v-if="subtitle" class="truncate text-xs text-muted">{{ subtitle }}</p>
      </div>
      <UTooltip :text="$t('reader.comic.thumbnails')">
        <UButton
          icon="i-lucide-layout-grid"
          color="neutral"
          variant="ghost"
          size="lg"
          square
          class="size-11 justify-center"
          :aria-label="$t('reader.comic.thumbnails')"
          @click="$emit('thumbnails')"
        />
      </UTooltip>
      <UTooltip :text="$t('reader.comic.settings')">
        <UButton
          icon="i-lucide-sliders-horizontal"
          color="neutral"
          variant="ghost"
          size="lg"
          square
          class="size-11 justify-center"
          :aria-label="$t('reader.comic.settings')"
          @click="$emit('settings')"
        />
      </UTooltip>
    </header>
    <ComicSegmented
      v-model="layout"
      :label="$t('reader.comic.layout.label')"
      :options="layouts"
      class="mx-2 sm:mx-auto sm:w-96"
    />
  </div>
</template>
