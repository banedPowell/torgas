<script setup lang="ts">
const route = useRoute()
const { work, state } = useWork(() => String(route.params.id))
</script>

<template>
  <UDashboardPanel id="work" class="min-h-0 flex-1">
    <template #header>
      <div class="px-2 pt-4 sm:px-4">
        <UButton
          to="/"
          icon="i-lucide-arrow-left"
          color="neutral"
          variant="ghost"
          :label="$t('work.back')"
        />
      </div>
    </template>

    <template #body>
      <div v-if="state === 'idle' || state === 'loading'" class="flex gap-4">
        <USkeleton class="aspect-[2/3] w-32 rounded-sm" />
        <div class="flex flex-1 flex-col gap-2">
          <USkeleton class="h-8 w-2/3" />
          <USkeleton class="h-4 w-1/3" />
        </div>
      </div>

      <EmptyState
        v-else-if="!work"
        icon="i-lucide-book-x"
        :title="$t('work.notFound.title')"
        :description="$t('work.notFound.description')"
      >
        <UButton to="/" :label="$t('work.back')" />
      </EmptyState>

      <EmptyState
        v-else
        icon="i-lucide-book-open"
        :title="work.title"
        :description="$t('work.soon.description')"
      >
        <UButton :to="`/read/${work.id}`" icon="i-lucide-book-open" :label="$t('work.read')" />
      </EmptyState>
    </template>
  </UDashboardPanel>
</template>
