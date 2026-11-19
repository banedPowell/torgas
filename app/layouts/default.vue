<script setup lang="ts">
import type { NavigationMenuItem } from '@nuxt/ui'

const { t } = useI18n()
const { counts, resume, ensureLoaded, dismissResume } = useLibrary()

onMounted(ensureLoaded)

// Phase 0 : seule la Bibliothèque existe ; les autres onglets viendront avec leurs écrans.
const items = computed<NavigationMenuItem[]>(() => [
  {
    label: t('nav.library'),
    icon: 'i-lucide-library',
    to: '/',
    badge: counts.value.all || undefined,
  },
])
</script>

<template>
  <UDashboardGroup unit="rem">
    <UDashboardSidebar
      id="main"
      :toggle="false"
      :default-size="15"
      :min-size="13"
      :max-size="20"
      resizable
      class="border-e border-default bg-muted"
    >
      <template #header>
        <NuxtLink
          to="/"
          class="px-2.5 font-display text-xl font-semibold tracking-[0.08em] text-primary uppercase"
        >
          {{ $t('app.name') }}
        </NuxtLink>
      </template>

      <UNavigationMenu
        :items="items"
        orientation="vertical"
        color="neutral"
        :aria-label="$t('nav.main')"
        :ui="{
          link: 'h-10 px-2.5 text-sm before:inset-y-0 before:rounded-[10px] aria-[current=page]:font-semibold aria-[current=page]:before:bg-accented',
        }"
      />

      <template #footer>
        <UColorModeButton :aria-label="$t('nav.colorMode')" />
      </template>
    </UDashboardSidebar>

    <div class="flex min-w-0 flex-1 flex-col">
      <!-- La barre Reprendre flotte au-dessus du contenu : elle ne lui prend pas de place.
           --resume-space réserve de quoi faire défiler la fin des listes sous elle. -->
      <div
        class="relative flex min-h-0 flex-1 flex-col"
        :style="resume ? { '--resume-space': '5.5rem' } : undefined"
      >
        <slot />

        <Transition
          enter-active-class="transition duration-200 ease-out"
          leave-active-class="transition duration-150 ease-in"
          enter-from-class="translate-y-2 opacity-0"
          leave-to-class="translate-y-2 opacity-0"
        >
          <div
            v-if="resume"
            class="pointer-events-none absolute inset-x-0 bottom-0 z-10 px-2 pb-2 lg:px-6 lg:pb-4"
          >
            <ResumeBar
              :work="resume"
              class="pointer-events-auto shadow-lg lg:mx-auto lg:max-w-xl"
              @dismiss="dismissResume"
            />
          </div>
        </Transition>
      </div>

      <nav
        :aria-label="$t('nav.main')"
        class="flex shrink-0 items-center justify-around border-t border-default px-1 pt-1.5 pb-[max(1rem,env(safe-area-inset-bottom))] lg:hidden"
      >
        <NuxtLink
          v-for="item in items"
          :key="String(item.to)"
          :to="item.to"
          active-class="text-primary font-semibold"
          class="flex min-h-11 min-w-16 flex-col items-center justify-center gap-0.5 text-[11px] font-medium text-muted"
        >
          <UIcon :name="item.icon!" class="size-[22px]" aria-hidden="true" />
          {{ item.label }}
        </NuxtLink>
        <UColorModeButton
          :aria-label="$t('nav.colorMode')"
          class="min-h-11 min-w-11 justify-center"
        />
      </nav>
    </div>
  </UDashboardGroup>
</template>
