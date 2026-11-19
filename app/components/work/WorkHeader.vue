<script setup lang="ts">
import type { WorkMeta } from '~/types/work'

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

const details = computed(() => {
  const items = [
    { key: 'format', value: t(`format.${props.meta.format}`) },
    { key: 'size', value: formatBytes(props.meta.sizeBytes) },
  ]
  if (props.meta.isSeries) {
    items.unshift({ key: 'volumes', value: String(props.meta.volumeCount) })
  }
  if (props.meta.language)
    items.push({ key: 'language', value: formatLanguage(props.meta.language) })
  const added = formatDate(props.meta.addedAt)
  if (added) items.push({ key: 'added', value: added })
  return items
})
</script>

<template>
  <header class="flex flex-col gap-5">
    <div class="flex gap-4 lg:flex-col lg:gap-6">
      <div
        class="aspect-[2/3] w-28 shrink-0 rounded-sm shadow-[6px_6px_0_var(--ui-border-accented)] sm:w-36 lg:w-56"
      >
        <CoverImage :src="meta.coverUrl" :title="meta.title" />
      </div>

      <div class="flex min-w-0 flex-1 flex-col gap-2">
        <span class="font-mono text-[11px] tracking-wider text-muted uppercase">{{ eyebrow }}</span>
        <h1
          class="font-display text-3xl leading-[1.05] font-medium text-highlighted [overflow-wrap:anywhere] lg:text-4xl"
        >
          {{ meta.title }}
        </h1>
        <p class="text-sm text-toned">{{ authors }}</p>
      </div>
    </div>

    <!-- Réglages (statut, sens de lecture) : sous la couverture pour disposer de toute la largeur. -->
    <slot />

    <dl
      :aria-label="$t('work.details.label')"
      class="grid grid-cols-2 gap-x-4 gap-y-3 border-t border-default pt-4"
    >
      <div v-for="item in details" :key="item.key" class="flex min-w-0 flex-col gap-0.5">
        <dt class="font-mono text-[11px] tracking-wider text-muted uppercase">
          {{ $t(`work.details.${item.key}`) }}
        </dt>
        <dd class="text-sm text-highlighted">{{ item.value }}</dd>
      </div>
    </dl>
  </header>
</template>
