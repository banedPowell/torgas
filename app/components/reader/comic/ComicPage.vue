<script setup lang="ts">
import type { ComicFit } from '~/utils/comic'

const props = withDefaults(
  defineProps<{
    /** Page à partir de 0. */
    page: number
    total: number
    fit: ComicFit
    resolve: (page: number, fresh?: boolean) => Promise<string>
    /** Côté de la reliure en double page : la page se colle contre elle. */
    align?: 'start' | 'end' | 'center'
  }>(),
  { align: 'center' },
)

type Status = 'loading' | 'loaded' | 'error'

const src = ref<string>()
const status = ref<Status>('loading')
const attempt = ref(0)
const label = computed(() => props.page + 1)

async function load(fresh = false) {
  const page = props.page
  status.value = 'loading'
  src.value = undefined
  try {
    const url = await props.resolve(page, fresh)
    if (page === props.page) src.value = url
  } catch {
    if (page === props.page) status.value = 'error'
  }
}

function retry() {
  attempt.value++
  load(true)
}

watch(
  () => props.page,
  () => load(),
  { immediate: true },
)

const justify = { start: 'justify-start', end: 'justify-end', center: 'justify-center' }
const rootClass = computed(() => [
  'relative flex min-w-0',
  justify[props.align],
  props.fit === 'width' && 'w-full flex-1 items-start',
  props.fit === 'screen' && 'h-full flex-1 items-center',
  props.fit === 'height' && 'h-full flex-none items-center',
  props.fit === 'height' && status.value !== 'loaded' && 'aspect-[2/3]',
])
const imgClass = {
  width: 'h-auto w-full',
  height: 'h-full w-auto max-w-none',
  screen: 'max-h-full max-w-full object-contain',
}
</script>

<template>
  <div :class="rootClass">
    <img
      v-if="src"
      v-show="status === 'loaded'"
      :key="attempt"
      :src="src"
      :alt="$t('reader.comic.pageAlt', { page: label, total })"
      decoding="async"
      draggable="false"
      class="block select-none"
      :class="imgClass[fit]"
      @load="status = 'loaded'"
      @error="status = 'error'"
    />

    <div
      v-if="status === 'loading'"
      role="status"
      class="flex flex-col items-center justify-center gap-3"
      :class="fit === 'width' ? 'aspect-[2/3] w-full' : 'absolute inset-0'"
    >
      <USkeleton class="absolute inset-0 rounded-none" />
      <UIcon
        name="i-lucide-loader-circle"
        class="relative size-9 animate-spin text-muted motion-reduce:animate-none"
        aria-hidden="true"
      />
      <span class="relative text-sm text-muted">
        {{ $t('reader.comic.loadingPage', { page: label }) }}
      </span>
    </div>

    <div
      v-else-if="status === 'error'"
      role="alert"
      class="flex flex-col items-center justify-center gap-3 bg-muted p-6 text-center"
      :class="fit === 'width' ? 'aspect-[2/3] w-full' : 'absolute inset-0'"
    >
      <UIcon name="i-lucide-image-off" class="size-8 text-muted" aria-hidden="true" />
      <p class="text-sm text-default">{{ $t('reader.comic.pageError', { page: label }) }}</p>
      <UButton
        icon="i-lucide-rotate-cw"
        color="neutral"
        variant="outline"
        :label="$t('reader.comic.retry')"
        @click.stop="retry"
      />
    </div>
  </div>
</template>
