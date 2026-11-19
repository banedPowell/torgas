<script setup lang="ts">
import type { TabsItem } from '@nuxt/ui'
import type { Bookmark } from '~/types/core'
import type { ReaderTocEntry } from '~/types/reader'

defineProps<{
  entries: ReaderTocEntry[]
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
          <p v-if="!entries.length" class="px-3 py-6 text-sm text-muted">
            {{ $t('reader.toc.empty') }}
          </p>
          <nav v-else :aria-label="$t('reader.toc.contents')">
            <ul class="flex flex-col">
              <li v-for="entry in entries" :key="entry.href">
                <button
                  type="button"
                  class="flex min-h-11 w-full items-center rounded-md px-3 py-2 text-start text-sm hover:bg-elevated focus-visible:outline-2 focus-visible:outline-primary"
                  :class="
                    entry.href === currentHref ? 'font-semibold text-primary' : 'text-default'
                  "
                  :style="{ paddingInlineStart: `${0.75 + entry.depth}rem` }"
                  :aria-current="entry.href === currentHref ? 'location' : undefined"
                  @click="emit('navigate', entry.href)"
                >
                  {{ entry.label }}
                </button>
              </li>
            </ul>
          </nav>
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
              <UButton
                icon="i-lucide-trash-2"
                color="neutral"
                variant="ghost"
                class="size-11 justify-center"
                :aria-label="$t('reader.toc.remove', { label: bookmark.label })"
                @click="emit('removeBookmark', bookmark.id)"
              />
            </li>
          </ul>
        </template>
      </UTabs>
    </template>
  </USlideover>
</template>
