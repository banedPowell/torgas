<script setup lang="ts">
// Barre escamotable du lecteur (en-tête + progression), superposée au texte.
import type { ReaderPosition } from '~/types/reader'

const props = defineProps<{
  visible: boolean
  title: string
  authors: readonly string[]
  bookmarked: boolean
  position: ReaderPosition | null
}>()

// « Flaubert · Première partie » : auteurs et chapitre courant.
const subtitle = computed(() =>
  [formatAuthors(props.authors), props.position?.chapter].filter(Boolean).join(' · '),
)

const emit = defineEmits<{
  show: []
  keepAlive: []
  close: []
  toc: []
  bookmark: []
  settings: []
  seek: [fraction: number]
}>()
</script>

<template>
  <button
    v-if="!visible"
    type="button"
    class="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-1/2 focus:-translate-x-1/2 focus:rounded-md focus:bg-elevated focus:px-4 focus:py-3"
    @click="emit('show')"
  >
    {{ $t('reader.showUi') }}
  </button>

  <Transition
    enter-active-class="transition-opacity duration-200"
    leave-active-class="transition-opacity duration-200"
    enter-from-class="opacity-0"
    leave-to-class="opacity-0"
  >
    <div v-if="visible" @pointermove="emit('keepAlive')" @focusin="emit('keepAlive')">
      <ReaderToolbar
        class="absolute inset-x-0 top-0"
        :title="title"
        :subtitle="subtitle"
        :bookmarked="bookmarked"
        @close="emit('close')"
        @toc="emit('toc')"
        @bookmark="emit('bookmark')"
        @settings="emit('settings')"
      />
      <ReaderProgress
        class="absolute inset-x-0 bottom-0"
        :progress="position?.progress ?? 0"
        :page-label="position?.pageLabel"
        :chapter-minutes-left="position?.chapterMinutesLeft"
        @seek="(f) => emit('seek', f)"
      />
    </div>
  </Transition>

  <!-- Le pourcentage seul n'apparaît qu'une fois la barre effacée (sans chevauchement), et
       disparaît aussitôt quand elle revient. -->
  <Transition
    enter-active-class="transition-opacity duration-150 delay-200"
    enter-from-class="opacity-0"
  >
    <div
      v-if="!visible && position"
      class="pointer-events-none absolute inset-x-0 bottom-[max(1.125rem,env(safe-area-inset-bottom))] text-center font-mono text-[11px] text-muted"
      aria-hidden="true"
    >
      {{ formatPercent(position.progress) }}
    </div>
  </Transition>
</template>
