<script setup lang="ts">
// Bulle d'aperçu d'une note de bas de page, placée sous (ou au-dessus de) l'appel de note.
// Rendue dans le lecteur : elle suit son thème (papier, sépia, sombre, noir) par les jetons.
import type { FootnotePreview } from '~/composables/useFootnotePreview'

const props = defineProps<{
  note: FootnotePreview
  /** Taille de la zone du lecteur, pour garder la bulle à l'écran. */
  bounds: { width: number; height: number }
}>()
const emit = defineEmits<{ close: []; goTo: []; enter: []; leave: [] }>()

const MARGIN = 16
const GAP = 8
const MAX_WIDTH = 352

const goToButton = useTemplateRef<{ $el: HTMLElement }>('goTo')
const titleId = useId()

const placement = computed(() => {
  const { anchor } = props.note
  const width = Math.min(MAX_WIDTH, props.bounds.width - 2 * MARGIN)
  const center = anchor.x + anchor.width / 2
  const left = Math.min(Math.max(center - width / 2, MARGIN), props.bounds.width - width - MARGIN)
  const below = anchor.y + anchor.height / 2 < props.bounds.height / 2
  const space = below
    ? props.bounds.height - (anchor.y + anchor.height + GAP) - MARGIN
    : anchor.y - GAP - MARGIN
  return {
    left: `${left}px`,
    width: `${width}px`,
    maxHeight: `${Math.max(space, 120)}px`,
    ...(below
      ? { top: `${anchor.y + anchor.height + GAP}px` }
      : { bottom: `${props.bounds.height - anchor.y + GAP}px` }),
  }
})

// Ouverte au clavier : le focus passe sur « Aller à la note » (Échap le rend à l'appel).
watch(
  () => props.note,
  async (note) => {
    if (!note.keyboard) return
    await nextTick()
    goToButton.value?.$el.focus()
  },
  { immediate: true },
)
</script>

<template>
  <div
    role="dialog"
    :aria-labelledby="titleId"
    class="absolute z-40 flex flex-col overflow-hidden rounded-md bg-elevated text-default shadow-lg ring ring-default"
    :style="placement"
    @pointerenter="emit('enter')"
    @pointerleave="emit('leave')"
  >
    <p :id="titleId" class="px-4 pt-3 text-xs font-medium tracking-wide text-muted uppercase">
      {{
        note.label
          ? $t('reader.footnote.title', { label: note.label })
          : $t('reader.footnote.untitled')
      }}
    </p>
    <div class="min-h-0 overflow-y-auto px-4 py-2 text-sm/relaxed whitespace-pre-line">
      {{ note.text }}
    </div>
    <div class="flex items-center justify-between gap-2 border-t border-default px-2 py-1">
      <UButton
        ref="goTo"
        :label="$t('reader.footnote.goTo')"
        trailing-icon="i-lucide-arrow-right"
        variant="link"
        class="min-h-11"
        @click="emit('goTo')"
      />
      <UButton
        v-if="note.pinned"
        icon="i-lucide-x"
        color="neutral"
        variant="ghost"
        :aria-label="$t('reader.footnote.close')"
        class="size-11 justify-center"
        @click="emit('close')"
      />
    </div>
  </div>
</template>
