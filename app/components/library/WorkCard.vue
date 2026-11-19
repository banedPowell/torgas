<script setup lang="ts">
import type { ContextMenuItem } from '@nuxt/ui'
import type { LibraryEntry } from '~/types/library'

const props = defineProps<{
  entry: LibraryEntry
  /** Menu contextuel (clic droit, appui long sur mobile) ; absent en mode sélection. */
  menu?: ContextMenuItem[][]
  /** Mode sélection : la carte coche ou décoche au lieu d'ouvrir la fiche. */
  selectable?: boolean
  selected?: boolean
}>()

const emit = defineEmits<{ toggle: [id: string] }>()

const { t } = useI18n()
const summary = computed(() => summarizeEntry(props.entry))
const badge = computed(() => {
  const format = t(`format.${summary.value.format}`)
  return summary.value.isSeries ? t('library.entry.seriesBadge', { format }) : format
})
const meta = computed(() =>
  summary.value.isSeries
    ? seriesCounts(summary.value)
        .map(({ key, ...count }) => t(`library.entry.${key}`, count))
        .join(' · ')
    : formatAuthors(summary.value.authors) || t('library.entry.unknownAuthor'),
)

const NuxtLink = resolveComponent('NuxtLink')
/** Lien vers la fiche, ou case à cocher (bouton) en mode sélection. */
const rootAttrs = computed(() =>
  props.selectable
    ? {
        type: 'button',
        role: 'checkbox',
        'aria-checked': props.selected ?? false,
        'aria-label': t('library.selection.select', { title: summary.value.title }),
        onClick: () => emit('toggle', props.entry.id),
      }
    : { to: summary.value.href },
)
</script>

<template>
  <UContextMenu :items="menu ?? []" :disabled="!menu || selectable">
    <component
      :is="selectable ? 'button' : NuxtLink"
      v-bind="rootAttrs"
      class="group flex w-full flex-col gap-1.5 rounded-md text-start [-webkit-touch-callout:none] text-highlighted focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
    >
      <div class="relative aspect-[2/3]">
        <div
          v-if="summary.isSeries"
          aria-hidden="true"
          class="absolute -top-1 right-[-2px] bottom-1.5 left-1.5 rounded-sm bg-(--ui-border-accented)"
        />
        <CoverImage
          :src="summary.coverUrl"
          :title="summary.title"
          class="absolute inset-0 transition-transform duration-150 group-hover:-translate-y-0.5"
        />
        <span
          class="absolute top-1.5 left-1.5 rounded-sm bg-scrim px-[5px] py-0.5 font-mono text-[9px] leading-tight tracking-wider text-on-scrim uppercase"
        >
          {{ badge }}
        </span>
        <span
          v-if="selectable"
          aria-hidden="true"
          class="absolute top-1.5 right-1.5 flex size-6 items-center justify-center rounded-[5px] border-2 border-on-scrim"
          :class="selected ? 'bg-primary text-inverted' : 'bg-scrim text-transparent'"
        >
          <UIcon name="i-lucide-check" class="size-3.5" />
        </span>
      </div>
      <div class="flex min-w-0 flex-col gap-0.5">
        <span class="line-clamp-2 text-[13px] leading-tight font-semibold">{{
          summary.title
        }}</span>
        <span class="truncate text-xs text-muted">{{ meta }}</span>
      </div>
      <UProgress
        :model-value="Math.round(summary.progress * 100)"
        size="2xs"
        :aria-label="$t('library.entry.progress', { percent: formatPercent(summary.progress) })"
      />
    </component>
  </UContextMenu>
</template>
