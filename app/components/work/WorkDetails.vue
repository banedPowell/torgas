<script setup lang="ts">
import type { WorkMeta } from '~/types/work'

/** Informations secondaires de la fiche : format, taille, langue, date d'ajout. */
const props = defineProps<{ meta: WorkMeta }>()

const { t } = useI18n()
const details = computed(() => {
  const items = [
    { key: 'format', value: t(`format.${props.meta.format}`) },
    { key: 'size', value: formatBytes(props.meta.sizeBytes) },
  ]
  if (props.meta.isSeries) {
    const counts = [
      { key: 'volumes', value: String(props.meta.volumeCount) },
      { key: 'chapters', value: String(props.meta.chapterCount) },
    ]
    items.unshift(...counts.filter((c) => c.value !== '0'))
  }
  if (props.meta.language)
    items.push({ key: 'language', value: formatLanguage(props.meta.language) })
  const added = formatDate(props.meta.addedAt)
  if (added) items.push({ key: 'added', value: added })
  return items
})
</script>

<template>
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
</template>
