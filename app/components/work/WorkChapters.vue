<script setup lang="ts">
import type { ChapterRow } from '~/utils/chapters'

/** Liste des chapitres de la fiche (artboard `FicheOeuvre`, onglet « Chapitres »). */
const props = defineProps<{
  workId: string
  rows: readonly ChapterRow[]
  count: number
  loading?: boolean
}>()

const { t } = useI18n()

function chapterLink(href: string) {
  return { path: `/read/${props.workId}`, query: { at: href } }
}

/** Menu contextuel d'un chapitre (clic droit, appui long sur mobile). */
function chapterMenu(href: string) {
  return [[{ label: t('work.chapters.readFrom'), icon: 'i-lucide-play', to: chapterLink(href) }]]
}
</script>

<template>
  <section :aria-labelledby="`chapters-${workId}`" class="flex flex-col">
    <h2
      :id="`chapters-${workId}`"
      class="border-b border-default pb-2.5 text-sm font-semibold text-highlighted"
    >
      {{ loading ? $t('work.chapters.title') : $t('work.chapters.count', { n: count }) }}
    </h2>

    <div v-if="loading" role="status" :aria-label="$t('work.chapters.loading')">
      <div v-for="n in 5" :key="n" class="flex min-h-12 items-center gap-3 border-b border-default">
        <USkeleton class="h-3 w-6" />
        <USkeleton class="h-3.5 flex-1" :style="{ maxWidth: `${40 + ((n * 17) % 45)}%` }" />
      </div>
    </div>

    <ol v-else :aria-label="$t('work.chapters.label')" class="flex flex-col">
      <template v-for="row in rows" :key="row.href + row.label">
        <li
          v-if="row.kind === 'part'"
          class="pt-3 pb-1.5 font-mono text-[11px] tracking-[0.06em] text-muted uppercase"
        >
          {{ row.label }}
        </li>
        <li v-else class="border-b border-default">
          <UContextMenu :items="chapterMenu(row.href)">
            <NuxtLink
              :to="chapterLink(row.href)"
              class="flex min-h-12 items-center gap-3 rounded-sm py-1 focus-visible:outline-2 focus-visible:outline-primary"
              :class="row.state === 'read' ? 'text-muted' : 'text-highlighted'"
            >
              <span class="w-8 shrink-0 font-mono text-xs text-muted">{{ row.number }}</span>
              <span
                class="min-w-0 flex-1 truncate text-[15px]"
                :class="row.state === 'current' ? 'font-semibold' : ''"
              >
                {{ row.label }}
              </span>
              <UIcon
                v-if="row.state === 'read'"
                name="i-lucide-check"
                class="size-[18px] shrink-0 text-primary"
                :aria-label="$t('work.chapters.read')"
                role="img"
              />
              <span
                v-else-if="row.state === 'current'"
                class="shrink-0 rounded-full bg-primary px-2 py-0.5 text-[11px] font-semibold text-inverted"
              >
                {{ formatPercent(row.progress) }}
              </span>
            </NuxtLink>
          </UContextMenu>
        </li>
      </template>
    </ol>
  </section>
</template>
