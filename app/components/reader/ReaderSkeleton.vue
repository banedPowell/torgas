<!-- Squelette affiché pendant l'ouverture d'un livre (proportions de l'artboard LecteurEPUB). -->
<template>
  <div
    class="mx-auto flex w-full max-w-2xl flex-col gap-3 px-7 pt-24"
    role="status"
    :aria-label="$t('reader.loading')"
  >
    <USkeleton class="mb-2 h-3 w-32" />
    <USkeleton v-for="n in 12" :key="n" class="h-4" :class="n % 4 === 0 ? 'w-2/3' : 'w-full'" />
  </div>
</template>
