<script setup lang="ts">
import type { ReaderSettings } from '~/types/reader'
import {
  FONT_FAMILY,
  FONT_SIZE,
  LINE_HEIGHT,
  READER_FONTS,
  READER_MARGINS,
  READER_THEMES,
} from '~/utils/reader'

const props = defineProps<{ settings: Readonly<ReaderSettings> }>()
const emit = defineEmits<{ update: [patch: Partial<ReaderSettings>]; reset: [] }>()
const open = defineModel<boolean>('open', { required: true })

const fontSize = computed({
  get: () => props.settings.fontSize,
  set: (fontSize: number) => emit('update', { fontSize }),
})
const lineHeight = computed({
  get: () => props.settings.lineHeight,
  set: (lineHeight: number) => emit('update', { lineHeight }),
})
</script>

<template>
  <USlideover v-model:open="open" side="right" :title="$t('reader.settings.title')">
    <template #body>
      <div class="flex flex-col gap-6">
        <fieldset class="flex flex-col gap-2">
          <legend class="mb-2 text-sm font-semibold text-highlighted">
            {{ $t('reader.settings.theme') }}
          </legend>
          <div class="grid grid-cols-5 gap-2">
            <button
              v-for="theme in READER_THEMES"
              :key="theme"
              type="button"
              :data-reader-theme="theme === 'auto' ? undefined : theme"
              class="flex min-h-16 flex-col items-center justify-center gap-1 rounded-md border bg-default text-xs text-default focus-visible:outline-2 focus-visible:outline-primary"
              :class="
                settings.theme === theme ? 'border-primary ring-2 ring-primary' : 'border-accented'
              "
              :aria-pressed="settings.theme === theme"
              @click="emit('update', { theme })"
            >
              <UIcon
                v-if="theme === 'auto'"
                name="i-lucide-sun-moon"
                class="size-4"
                aria-hidden="true"
              />
              <span v-else class="font-serif text-base" aria-hidden="true">Aa</span>
              {{ $t(`reader.settings.themes.${theme}`) }}
            </button>
          </div>
        </fieldset>

        <fieldset class="flex flex-col gap-2">
          <legend class="mb-2 text-sm font-semibold text-highlighted">
            {{ $t('reader.settings.font') }}
          </legend>
          <UFieldGroup class="w-full">
            <UButton
              v-for="font in READER_FONTS"
              :key="font"
              :label="$t(`reader.settings.fonts.${font}`)"
              :color="settings.font === font ? 'primary' : 'neutral'"
              :variant="settings.font === font ? 'solid' : 'soft'"
              size="lg"
              class="min-h-11 flex-1 justify-center"
              :style="{ fontFamily: FONT_FAMILY[font] ?? undefined }"
              :aria-pressed="settings.font === font"
              @click="emit('update', { font })"
            />
          </UFieldGroup>
        </fieldset>

        <div class="flex flex-col gap-2">
          <span id="reader-font-size" class="text-sm font-semibold text-highlighted">
            {{ $t('reader.settings.fontSize') }}
            <span class="ms-1 font-mono text-xs font-normal text-muted"
              >{{ settings.fontSize }} px</span
            >
          </span>
          <div class="flex items-center gap-2">
            <UTooltip :text="$t('reader.settings.smaller')">
              <UButton
                icon="i-lucide-a-arrow-down"
                color="neutral"
                variant="ghost"
                class="size-11 justify-center"
                :aria-label="$t('reader.settings.smaller')"
                :disabled="settings.fontSize <= FONT_SIZE.min"
                @click="fontSize = settings.fontSize - FONT_SIZE.step"
              />
            </UTooltip>
            <USlider
              v-model="fontSize"
              :min="FONT_SIZE.min"
              :max="FONT_SIZE.max"
              :step="FONT_SIZE.step"
              aria-labelledby="reader-font-size"
              class="flex-1"
            />
            <UTooltip :text="$t('reader.settings.larger')">
              <UButton
                icon="i-lucide-a-arrow-up"
                color="neutral"
                variant="ghost"
                class="size-11 justify-center"
                :aria-label="$t('reader.settings.larger')"
                :disabled="settings.fontSize >= FONT_SIZE.max"
                @click="fontSize = settings.fontSize + FONT_SIZE.step"
              />
            </UTooltip>
          </div>
        </div>

        <div class="flex flex-col gap-3">
          <span id="reader-line-height" class="text-sm font-semibold text-highlighted">
            {{ $t('reader.settings.lineHeight') }}
            <span class="ms-1 font-mono text-xs font-normal text-muted">{{
              settings.lineHeight.toFixed(2)
            }}</span>
          </span>
          <USlider
            v-model="lineHeight"
            :min="LINE_HEIGHT.min"
            :max="LINE_HEIGHT.max"
            :step="LINE_HEIGHT.step"
            aria-labelledby="reader-line-height"
          />
        </div>

        <fieldset class="flex flex-col gap-2">
          <legend class="mb-2 text-sm font-semibold text-highlighted">
            {{ $t('reader.settings.margin') }}
          </legend>
          <UFieldGroup class="w-full">
            <UButton
              v-for="margin in READER_MARGINS"
              :key="margin"
              :label="$t(`reader.settings.margins.${margin}`)"
              :color="settings.margin === margin ? 'primary' : 'neutral'"
              :variant="settings.margin === margin ? 'solid' : 'soft'"
              size="lg"
              class="min-h-11 flex-1 justify-center"
              :aria-pressed="settings.margin === margin"
              @click="emit('update', { margin })"
            />
          </UFieldGroup>
        </fieldset>

        <UButton
          icon="i-lucide-rotate-ccw"
          :label="$t('reader.settings.reset')"
          color="neutral"
          variant="link"
          class="self-start"
          @click="emit('reset')"
        />
      </div>
    </template>
  </USlideover>
</template>
