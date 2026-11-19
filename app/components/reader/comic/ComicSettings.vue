<script setup lang="ts">
import type { ReadingDirection } from '~/types/core'
import type { ComicFit, ComicLayoutPreference } from '~/utils/comic'

/** Réglages du lecteur manga : sens (par série), mise en page et ajustement. */
defineProps<{ inSeries: boolean }>()

const open = defineModel<boolean>('open', { default: false })
const direction = defineModel<ReadingDirection>('direction', { required: true })
const layout = defineModel<ComicLayoutPreference>('layout', { required: true })
const fit = defineModel<ComicFit>('fit', { required: true })

const { t } = useI18n()
const directions = computed(() =>
  (['ltr', 'rtl'] as const).map((value) => ({
    value,
    label: t(`reader.comic.direction.${value}`),
  })),
)
const layouts = computed(() =>
  (['auto', 'single', 'double', 'webtoon'] as const).map((value) => ({
    value,
    label: t(`reader.comic.layout.${value}`),
  })),
)
const fits = computed(() =>
  (['width', 'height', 'screen'] as const).map((value) => ({
    value,
    label: t(`reader.comic.fit.${value}`),
  })),
)
</script>

<template>
  <USlideover v-model:open="open" :title="$t('reader.comic.settings')" side="right">
    <template #body>
      <div class="flex flex-col gap-6">
        <section class="flex flex-col gap-2">
          <h3 class="text-sm font-semibold text-highlighted">
            {{ $t('reader.comic.direction.label') }}
          </h3>
          <ComicSegmented
            v-model="direction"
            :label="$t('reader.comic.direction.label')"
            :options="directions"
          />
          <p v-if="inSeries" class="text-xs text-muted">
            {{ $t('reader.comic.direction.seriesHint') }}
          </p>
        </section>

        <section class="flex flex-col gap-2">
          <h3 class="text-sm font-semibold text-highlighted">
            {{ $t('reader.comic.layout.label') }}
          </h3>
          <ComicSegmented
            v-model="layout"
            :label="$t('reader.comic.layout.label')"
            :options="layouts"
          />
          <p v-if="layout === 'auto'" class="text-xs text-muted">
            {{ $t('reader.comic.layout.autoHint') }}
          </p>
        </section>

        <section v-if="layout !== 'webtoon'" class="flex flex-col gap-2">
          <h3 class="text-sm font-semibold text-highlighted">{{ $t('reader.comic.fit.label') }}</h3>
          <ComicSegmented v-model="fit" :label="$t('reader.comic.fit.label')" :options="fits" />
        </section>
      </div>
    </template>
  </USlideover>
</template>
