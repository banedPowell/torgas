<script setup lang="ts">
import type { Work } from '~/types/core'

/** Fin de volume : propose le volume suivant de la série, sinon le retour à la série. */
const props = defineProps<{
  work: Work
  nextVolume: Work | null
}>()

defineEmits<{ back: [] }>()

const { t } = useI18n()
const kicker = computed(() =>
  props.work.volume !== undefined
    ? t('reader.comic.end.kicker', { volume: props.work.volume })
    : t('reader.comic.end.kickerNone'),
)
</script>

<template>
  <section
    aria-labelledby="comic-end-title"
    class="mx-auto flex w-full max-w-md flex-col justify-center gap-5 rounded-xl bg-muted p-7 text-default"
  >
    <span class="font-mono text-xs tracking-[0.06em] text-muted uppercase">{{ kicker }}</span>
    <h2
      id="comic-end-title"
      class="font-display text-3xl font-medium text-highlighted"
      tabindex="-1"
    >
      {{
        nextVolume
          ? $t('reader.comic.end.title', { volume: nextVolume.volume })
          : $t('reader.comic.end.titleNone')
      }}
    </h2>

    <template v-if="nextVolume">
      <div class="flex items-center gap-3.5 rounded-xl bg-elevated p-3.5">
        <span
          aria-hidden="true"
          class="flex h-16 w-11 shrink-0 items-center justify-center rounded bg-inverted font-display text-xl text-inverted"
        >
          {{ nextVolume.volume }}
        </span>
        <div class="flex min-w-0 flex-col gap-1">
          <span class="truncate text-sm font-semibold text-highlighted">
            {{ nextVolume.title }}
          </span>
          <span class="text-xs text-muted">
            {{ $t('reader.comic.end.inLibrary') }}
            <template v-if="nextVolume.pageCount">
              · {{ $t('reader.comic.end.pages', nextVolume.pageCount) }}
            </template>
          </span>
        </div>
      </div>
      <UButton
        :to="`/read/${nextVolume.id}`"
        replace
        size="xl"
        block
        class="h-13 rounded-xl text-base"
        :label="$t('reader.comic.end.nextVolume')"
      />
    </template>
    <p v-else class="text-sm text-muted">{{ $t('reader.comic.end.description') }}</p>

    <UButton
      :to="`/works/${work.id}`"
      color="neutral"
      :variant="nextVolume ? 'link' : 'solid'"
      size="lg"
      block
      class="h-11"
      :label="$t('reader.comic.end.backToSeries')"
    />
    <UButton
      color="neutral"
      variant="ghost"
      icon="i-lucide-undo-2"
      class="min-h-11 self-center"
      :label="$t('reader.comic.end.backToPages')"
      @click="$emit('back')"
    />
  </section>
</template>
