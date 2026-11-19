<script setup lang="ts">
import type { AccordionItem, TabsItem } from '@nuxt/ui'
import type { Bookmark } from '~/types/core'
import type { ReaderTocEntry } from '~/types/reader'

const props = defineProps<{
  entries: readonly ReaderTocEntry[]
  /** Appels de notes séparés du sommaire (« [1] »…), repliés en fin de liste. */
  notes: readonly ReaderTocEntry[]
  /** Sommaire en cours de reconstruction depuis le spine. */
  building?: boolean
  currentHref?: string
  bookmarks: readonly Bookmark[]
}>()

const emit = defineEmits<{
  navigate: [href: string]
  openBookmark: [cfi: string]
  removeBookmark: [id: string]
}>()

const open = defineModel<boolean>('open', { required: true })

const { t } = useI18n()
const tabs = computed<TabsItem[]>(() => [
  { label: t('reader.toc.contents'), icon: 'i-lucide-list', slot: 'contents' as const },
  { label: t('reader.toc.bookmarks'), icon: 'i-lucide-bookmark', slot: 'bookmarks' as const },
])
const notesGroup = computed<AccordionItem[]>(() => [
  {
    label: t('reader.toc.notesCount', { n: props.notes.length }),
    icon: 'i-lucide-asterisk',
    slot: 'notes' as const,
  },
])
</script>

<template>
  <USlideover
    v-model:open="open"
    side="left"
    :title="$t('reader.toc.title')"
    :ui="{ body: 'p-0 sm:p-0' }"
  >
    <template #body>
      <UTabs
        :items="tabs"
        variant="link"
        class="w-full"
        :ui="{ list: 'px-4', content: 'px-2 pb-6' }"
      >
        <template #contents>
          <div
            v-if="building && !entries.length"
            role="status"
            :aria-label="$t('reader.toc.building')"
            class="flex flex-col gap-3 px-3 py-4"
          >
            <USkeleton v-for="n in 6" :key="n" class="h-4" :class="n % 2 ? 'w-3/4' : 'w-1/2'" />
          </div>
          <p v-else-if="!entries.length && !notes.length" class="px-3 py-6 text-sm text-muted">
            {{ $t('reader.toc.empty') }}
          </p>
          <ReaderTocList
            v-if="entries.length"
            :entries="entries"
            :current-href="currentHref"
            :label="$t('reader.toc.contents')"
            @navigate="(href) => emit('navigate', href)"
          />
          <UAccordion
            v-if="notes.length"
            :items="notesGroup"
            class="mt-2 border-t border-default"
            :ui="{ trigger: 'min-h-11 px-3 text-sm text-muted', body: 'pb-2' }"
          >
            <template #notes-body>
              <ReaderTocList
                :entries="notes"
                :label="$t('reader.toc.notes')"
                @navigate="(href) => emit('navigate', href)"
              />
            </template>
          </UAccordion>
        </template>
        <template #bookmarks>
          <div v-if="!bookmarks.length" class="px-3 py-6 text-sm text-muted">
            <p>{{ $t('reader.toc.noBookmarks') }}</p>
            <p>{{ $t('reader.toc.noBookmarksHint') }}</p>
          </div>
          <ul v-else class="flex flex-col">
            <li v-for="bookmark in bookmarks" :key="bookmark.id" class="flex items-center gap-1">
              <button
                type="button"
                class="flex min-h-11 min-w-0 flex-1 items-center justify-between gap-3 rounded-md px-3 py-2 text-start text-sm hover:bg-elevated focus-visible:outline-2 focus-visible:outline-primary"
                @click="bookmark.locator.cfi && emit('openBookmark', bookmark.locator.cfi)"
              >
                <span class="truncate">{{ bookmark.label }}</span>
                <span class="shrink-0 font-mono text-xs text-muted">
                  {{ formatPercent(bookmark.locator.progress) }}
                </span>
              </button>
              <UTooltip :text="$t('reader.toc.remove', { label: bookmark.label })">
                <UButton
                  icon="i-lucide-trash-2"
                  color="neutral"
                  variant="ghost"
                  class="size-11 justify-center"
                  :aria-label="$t('reader.toc.remove', { label: bookmark.label })"
                  @click="emit('removeBookmark', bookmark.id)"
                />
              </UTooltip>
            </li>
          </ul>
        </template>
      </UTabs>
    </template>
  </USlideover>
</template>
