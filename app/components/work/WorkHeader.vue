<script setup lang="ts">
import type { WorkMeta } from '~/types/work'

/**
 * Tête de la fiche (artboard `FicheSerie`) : couverture, type, titre, auteur, puis les
 * réglages (slot : statut et sens de lecture) dans la colonne de droite sur mobile.
 */
const props = defineProps<{ meta: WorkMeta }>()

const { t } = useI18n()

const eyebrow = computed(() => {
  const params = {
    kind: t(`work.kind.${props.meta.kind}`),
    format: t(`format.${props.meta.format}`),
  }
  return t(props.meta.isSeries ? 'work.eyebrow.series' : 'work.eyebrow.work', params)
})
const authors = computed(
  () => formatAuthors(props.meta.authors) || t('library.entry.unknownAuthor'),
)
</script>

<template>
  <header class="flex flex-col gap-5">
    <div class="flex gap-4 lg:flex-col lg:gap-6">
      <div
        class="aspect-[2/3] w-28 shrink-0 self-start rounded-sm shadow-[6px_6px_0_var(--ui-border-accented)] sm:w-36 lg:w-56"
      >
        <CoverImage :src="meta.coverUrl" :title="meta.title" />
      </div>

      <div class="flex min-w-0 flex-1 flex-col gap-2">
        <span class="font-mono text-[11px] tracking-[0.06em] text-muted uppercase">
          {{ eyebrow }}
        </span>
        <h1
          class="font-display text-3xl leading-[1.05] font-medium text-highlighted [overflow-wrap:anywhere] lg:text-4xl"
        >
          {{ meta.title }}
        </h1>
        <p class="text-sm text-toned">{{ authors }}</p>
        <slot />
      </div>
    </div>

    <WorkDetails :meta="meta" class="max-lg:hidden" />
  </header>
</template>
