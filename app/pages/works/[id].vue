<script setup lang="ts">
import type { ReadingDirection, ReadingStatus } from '~/types/core'

const route = useRoute()
const { t } = useI18n()
const {
  state,
  error,
  meta,
  work,
  series,
  status,
  readTarget,
  action,
  saving,
  progress,
  summary,
  rows,
  next,
  missing,
  load,
  setStatus,
  setDirection,
} = useWork(() => String(route.params.id))

useHead({
  title: () => (meta.value ? `${meta.value.title} · ${t('app.name')}` : t('app.name')),
})

const loading = computed(() => state.value === 'idle' || state.value === 'loading')
const showDirection = computed(() => series.value && meta.value?.kind === 'comic')
</script>

<template>
  <UDashboardPanel id="work" class="min-h-0 flex-1">
    <template #header>
      <div class="px-2 pt-4 sm:px-4 lg:px-6">
        <UButton
          to="/"
          icon="i-lucide-arrow-left"
          color="neutral"
          variant="ghost"
          size="lg"
          :label="$t('work.back')"
        />
      </div>
    </template>

    <template #body>
      <div
        v-if="loading"
        role="status"
        :aria-label="$t('work.loading')"
        class="mx-auto grid w-full max-w-5xl gap-6 lg:grid-cols-[18rem_minmax(0,1fr)] lg:gap-10"
      >
        <div class="flex gap-4 lg:flex-col">
          <USkeleton class="aspect-[2/3] w-28 shrink-0 rounded-sm sm:w-36 lg:w-56" />
          <div class="flex flex-1 flex-col gap-2">
            <USkeleton class="h-3 w-1/3" />
            <USkeleton class="h-8 w-2/3" />
            <USkeleton class="h-4 w-1/3" />
          </div>
        </div>
        <div class="flex flex-col gap-4">
          <USkeleton class="h-13 w-full rounded-xl" />
          <USkeleton class="h-3 w-full" />
          <USkeleton v-for="n in 3" :key="n" class="h-16 w-full" />
        </div>
      </div>

      <EmptyState
        v-else-if="state === 'error'"
        icon="i-lucide-circle-alert"
        :title="$t('work.error.title')"
        :description="$t('work.error.description', { message: error })"
      >
        <UButton icon="i-lucide-rotate-ccw" :label="$t('work.error.action')" @click="load" />
        <UButton to="/" color="neutral" variant="outline" :label="$t('work.back')" />
      </EmptyState>

      <EmptyState
        v-else-if="!meta"
        icon="i-lucide-book-x"
        :title="$t('work.notFound.title')"
        :description="$t('work.notFound.description')"
      >
        <UButton to="/" icon="i-lucide-arrow-left" :label="$t('work.back')" />
      </EmptyState>

      <div
        v-else
        class="mx-auto grid w-full max-w-5xl items-start gap-6 lg:grid-cols-[18rem_minmax(0,1fr)] lg:gap-10"
      >
        <WorkHeader :meta="meta">
          <div v-if="status" class="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
            <WorkStatusSelect
              v-if="work"
              :model-value="work.status"
              :disabled="saving"
              @update:model-value="(value: ReadingStatus) => setStatus(value)"
            />
            <UBadge
              v-else
              :label="$t(`status.${status}`)"
              color="neutral"
              variant="subtle"
              size="lg"
              class="justify-self-start"
            />
            <WorkDirection
              v-if="showDirection && series"
              :model-value="series.direction"
              :disabled="saving"
              @update:model-value="(value: ReadingDirection) => setDirection(value)"
            />
          </div>
        </WorkHeader>

        <div class="flex min-w-0 flex-col gap-6">
          <WorkActions
            v-if="readTarget && action"
            :work-id="readTarget.id"
            :action="action"
            :volume="series ? readTarget.volume : undefined"
          />
          <WorkProgress :progress="progress" :summary="summary" />
          <WorkVolumes v-if="series" :rows="rows" :next-id="next?.id" :missing="missing" />
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>
