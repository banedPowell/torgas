<script setup lang="ts">
import type { ReadingDirection, Work } from '~/types/core'
import type { ComicLayout } from '~/utils/comic'

/** Lecteur manga et BD (CBZ), monté par `pages/read/[id].vue`. */
const props = defineProps<{ work: Work }>()
const emit = defineEmits<{ close: [] }>()

const reader = useComicReader(() => props.work)
const settings = useComicSettings()
const { t } = useI18n()
const toast = useToast()

const settingsOpen = ref(false)
const thumbnailsOpen = ref(false)
const overlayOpen = computed(() => settingsOpen.value || thumbnailsOpen.value)
const webtoon = computed(() => reader.layout.value === 'webtoon')

// Barres escamotables : visibles à l'ouverture, masquées après 3 s sans interaction.
const chrome = ref(true)
const hideTimer = useTimeoutFn(() => !overlayOpen.value && (chrome.value = false), 3000)
function showChrome() {
  chrome.value = true
  hideTimer.start()
}
function toggleChrome() {
  if (chrome.value) {
    chrome.value = false
    hideTimer.stop()
  } else showChrome()
}
// Au clavier, la barre reste visible tant qu'elle a le focus.
function onChromeFocus(event: FocusEvent) {
  if ((event.target as HTMLElement).matches(':focus-visible')) hideTimer.stop()
}
watch(overlayOpen, (open) => (open ? hideTimer.stop() : hideTimer.start()))
useEventListener(document, 'keydown', (e: KeyboardEvent) => e.key === 'Tab' && showChrome())

const title = computed(() => {
  const series = reader.series.value
  return series && props.work.volume !== undefined
    ? t('reader.comic.volumeTitle', { series: series.title, volume: props.work.volume })
    : props.work.title
})
const subtitle = computed(() =>
  reader.series.value ? props.work.title : props.work.authors.join(', ') || undefined,
)

const layoutModel = computed({
  get: () => reader.layout.value,
  set: (value: ComicLayout) => settings.setLayout(value),
})

async function setDirection(value: ReadingDirection) {
  try {
    await reader.setDirection(value)
  } catch {
    toast.add({ title: t('reader.comic.direction.error'), color: 'error' })
  }
}
defineShortcuts(
  computed(() => {
    const paged = !webtoon.value && !overlayOpen.value
    return {
      arrowleft: paged ? () => reader.goSide('left') : undefined,
      arrowright: paged ? () => reader.goSide('right') : undefined,
      ' ': paged ? () => reader.next() : undefined,
      escape: overlayOpen.value ? undefined : () => emit('close'),
    }
  }),
)
</script>

<template>
  <div class="relative size-full overflow-hidden bg-black">
    <div
      v-if="reader.state.value === 'idle' || reader.state.value === 'loading'"
      role="status"
      class="flex size-full items-center justify-center p-6"
    >
      <USkeleton class="aspect-[2/3] h-full max-h-[70vh] rounded-none" />
      <span class="sr-only">{{ $t('reader.comic.loading') }}</span>
    </div>

    <div
      v-else-if="reader.state.value === 'error'"
      class="flex size-full items-center justify-center bg-default"
    >
      <EmptyState
        icon="i-lucide-book-x"
        :title="$t('reader.comic.error.title')"
        :description="
          reader.error.value === 'empty'
            ? $t('reader.comic.error.empty')
            : $t('reader.comic.error.description', { message: reader.error.value })
        "
      >
        <UButton
          :label="$t('reader.comic.error.retry')"
          icon="i-lucide-rotate-cw"
          @click="reader.load()"
        />
        <UButton
          :label="$t('reader.comic.close')"
          color="neutral"
          variant="outline"
          @click="emit('close')"
        />
      </EmptyState>
    </div>

    <template v-else>
      <ComicWebtoon
        v-if="webtoon"
        :key="work.id"
        :page-count="reader.pageCount.value"
        :page="reader.page.value"
        :resolve="reader.pageUrl"
        @visible="reader.setVisiblePage"
        @end="reader.setEnded"
        @click="toggleChrome"
      >
        <template #end>
          <ComicEnd :work="work" :next-volume="reader.nextVolume.value" @back="reader.goTo(0)" />
        </template>
      </ComicWebtoon>

      <ComicPaged
        v-else
        :pages="reader.visiblePages.value"
        :total="reader.pageCount.value"
        :fit="settings.fit.value"
        :direction="reader.direction.value"
        :ended="reader.ended.value"
        :resolve="reader.pageUrl"
        @next="reader.next"
        @prev="reader.prev"
        @side="reader.goSide"
        @menu="toggleChrome"
      >
        <template #end>
          <ComicEnd :work="work" :next-volume="reader.nextVolume.value" @back="reader.prev()" />
        </template>
      </ComicPaged>

      <Transition
        enter-from-class="opacity-0"
        leave-to-class="opacity-0"
        enter-active-class="transition-opacity duration-200"
        leave-active-class="transition-opacity duration-150"
      >
        <div
          v-show="chrome"
          class="pointer-events-none absolute inset-0 flex flex-col justify-between"
          @pointermove="hideTimer.start()"
          @pointerdown="hideTimer.start()"
          @focusin="onChromeFocus"
          @focusout="hideTimer.start()"
        >
          <ComicToolbar
            v-model:layout="layoutModel"
            :title="title"
            :subtitle="subtitle"
            class="pointer-events-auto"
            @close="emit('close')"
            @settings="settingsOpen = true"
            @thumbnails="thumbnailsOpen = true"
          />
          <ComicPager
            :page="reader.page.value"
            :page-count="reader.pageCount.value"
            :direction="reader.direction.value"
            :resolve="reader.pageUrl"
            class="pointer-events-auto"
            @go="reader.goTo"
            @toggle-direction="setDirection(reader.direction.value === 'rtl' ? 'ltr' : 'rtl')"
          />
        </div>
      </Transition>

      <ComicThumbnails
        v-model:open="thumbnailsOpen"
        :page="reader.page.value"
        :page-count="reader.pageCount.value"
        :resolve="reader.pageUrl"
        @select="reader.goTo"
      />
      <ComicSettings
        v-model:open="settingsOpen"
        :direction="reader.direction.value"
        @update:direction="setDirection"
        :layout="settings.layout.value"
        :fit="settings.fit.value"
        :in-series="!!reader.series.value"
        @update:layout="settings.setLayout"
        @update:fit="settings.setFit"
      />
    </template>
  </div>
</template>
