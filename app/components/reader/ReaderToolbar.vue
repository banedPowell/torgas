<script setup lang="ts">
defineProps<{
  title: string
  subtitle?: string
  bookmarked: boolean
}>()

const emit = defineEmits<{
  close: []
  toc: []
  bookmark: []
  settings: []
}>()
</script>

<template>
  <header
    class="flex items-center gap-1 border-b border-default bg-elevated px-2 pt-[max(0.875rem,env(safe-area-inset-top))] pb-2.5 text-default"
  >
    <UTooltip :text="$t('reader.close')">
      <UButton
        icon="i-lucide-chevron-left"
        color="neutral"
        variant="ghost"
        size="xl"
        class="size-11 justify-center"
        :aria-label="$t('reader.close')"
        @click="emit('close')"
      />
    </UTooltip>
    <div class="flex min-w-0 flex-1 flex-col gap-px">
      <span class="truncate text-sm font-semibold">{{ title }}</span>
      <span v-if="subtitle" class="truncate text-xs text-muted">{{ subtitle }}</span>
    </div>
    <UTooltip :text="$t('reader.toolbar.toc')">
      <UButton
        icon="i-lucide-list"
        color="neutral"
        variant="ghost"
        size="lg"
        class="size-11 justify-center"
        :aria-label="$t('reader.toolbar.toc')"
        @click="emit('toc')"
      />
    </UTooltip>
    <UTooltip
      :text="bookmarked ? $t('reader.toolbar.removeBookmark') : $t('reader.toolbar.addBookmark')"
    >
      <UButton
        :icon="bookmarked ? 'i-lucide-bookmark-check' : 'i-lucide-bookmark'"
        :color="bookmarked ? 'primary' : 'neutral'"
        variant="ghost"
        size="lg"
        class="size-11 justify-center"
        :aria-label="
          bookmarked ? $t('reader.toolbar.removeBookmark') : $t('reader.toolbar.addBookmark')
        "
        :aria-pressed="bookmarked"
        @click="emit('bookmark')"
      />
    </UTooltip>
    <UButton
      color="neutral"
      variant="ghost"
      size="lg"
      class="size-11 justify-center font-serif text-lg"
      :aria-label="$t('reader.toolbar.settings')"
      @click="emit('settings')"
    >
      Aa
    </UButton>
  </header>
</template>
