<script setup lang="ts">
definePageMeta({ layout: 'reader' })

const route = useRoute()
const router = useRouter()

function close() {
  if (window.history.state?.back) router.back()
  else router.push(`/works/${route.params.id}`)
}

defineShortcuts({ escape: close })
</script>

<template>
  <div class="flex flex-1 flex-col">
    <div class="flex justify-end p-2">
      <UButton
        icon="i-lucide-x"
        color="neutral"
        variant="ghost"
        size="lg"
        :aria-label="$t('reader.close')"
        @click="close"
      />
    </div>
    <div class="flex flex-1 items-center justify-center">
      <EmptyState
        icon="i-lucide-book-open-text"
        :title="$t('reader.soon.title')"
        :description="$t('reader.soon.description')"
      />
    </div>
  </div>
</template>
