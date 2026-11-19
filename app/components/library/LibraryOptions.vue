<script setup lang="ts">
import type { FormatFilter, LibrarySort, LibraryView } from '~/types/library'

/**
 * Support, tri et affichage. Mobile : tri à gauche, support et affichage à droite (artboard
 * `Bibliotheque`) ; desktop : listes bordées comme dans `DesktopBibliotheque`.
 */
const props = defineProps<{
  format: FormatFilter
  sort: LibrarySort
  view: LibraryView
  desktop?: boolean
}>()

const emit = defineEmits<{
  'update:format': [value: FormatFilter]
  'update:sort': [value: LibrarySort]
  'update:view': [value: LibraryView]
}>()

const { t } = useI18n()

const FORMATS: FormatFilter[] = ['all', 'epub', 'cbz']
const SORTS: LibrarySort[] = ['lastRead', 'added', 'title']
const formatItems = computed(() =>
  FORMATS.map((value) => ({ value, label: t(`library.formatFilter.${value}`) })),
)
const sortItems = computed(() =>
  SORTS.map((value) => ({ value, label: t(`library.sort.${value}`) })),
)
const viewButtons: { value: LibraryView; icon: string }[] = [
  { value: 'grid', icon: 'i-lucide-layout-grid' },
  { value: 'list', icon: 'i-lucide-list' },
]

/** Desktop : liste bordée de 40 px ; mobile : texte discret de 36 px dont la zone de clic fait 44 px. */
const selectUi = computed(() => ({
  base: props.desktop
    ? 'h-10 rounded-[10px] border border-default bg-muted text-[13px] hover:bg-muted'
    : 'relative h-9 bg-transparent text-[13px] text-toned before:absolute before:inset-x-0 before:-inset-y-1 before:content-[""] hover:bg-transparent',
  trailingIcon: 'size-4 text-muted',
}))
</script>

<template>
  <div
    class="flex items-center gap-1"
    :class="desktop ? 'lg:gap-3' : 'justify-between'"
    role="group"
    :aria-label="$t('library.options')"
  >
    <USelect
      :model-value="sort"
      :items="sortItems"
      icon="i-lucide-arrow-down-up"
      :aria-label="$t('library.sort.label')"
      :variant="desktop ? 'soft' : 'ghost'"
      :ui="selectUi"
      :class="desktop ? 'order-2 w-48' : 'min-w-0'"
      @update:model-value="emit('update:sort', $event as LibrarySort)"
    />
    <div class="flex items-center gap-1" :class="desktop ? 'order-1' : ''">
      <USelect
        :model-value="format"
        :items="formatItems"
        :icon="desktop ? 'i-lucide-file-text' : undefined"
        :aria-label="$t('library.formatFilter.label')"
        :variant="desktop ? 'soft' : 'ghost'"
        :ui="selectUi"
        :class="desktop ? 'w-36' : 'min-w-0'"
        @update:model-value="emit('update:format', $event as FormatFilter)"
      />
      <UFieldGroup v-if="!desktop" :aria-label="$t('library.view.label')">
        <UButton
          v-for="button in viewButtons"
          :key="button.value"
          :icon="button.icon"
          color="neutral"
          :variant="view === button.value ? 'soft' : 'ghost'"
          :aria-label="$t(`library.view.${button.value}`)"
          :aria-pressed="view === button.value"
          class="size-11 justify-center rounded-[10px]"
          @click="emit('update:view', button.value)"
        />
      </UFieldGroup>
    </div>
    <UFieldGroup v-if="desktop" :aria-label="$t('library.view.label')" class="order-3">
      <UButton
        v-for="button in viewButtons"
        :key="button.value"
        :icon="button.icon"
        color="neutral"
        :variant="view === button.value ? 'soft' : 'ghost'"
        :aria-label="$t(`library.view.${button.value}`)"
        :aria-pressed="view === button.value"
        class="size-10 justify-center"
        @click="emit('update:view', button.value)"
      />
    </UFieldGroup>
  </div>
</template>
