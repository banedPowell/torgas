<script setup lang="ts">
/**
 * Dépôt de fichiers. Variante `overlay` (une seule par page) : zone plein écran qui apparaît
 * quand on survole la fenêtre avec des fichiers, plus un sélecteur caché ouvert par `open()`.
 * Variante `inline` : zone de dépôt cliquable (`UFileUpload`), comme dans le panneau d'import.
 * Les fichiers refusés par `accept` sont transmis quand même : le cœur les signale.
 * `hovering` affiche aussi la zone (desktop : le dépôt natif de Tauri masque les événements HTML5).
 */
const props = withDefaults(
  defineProps<{ variant?: 'overlay' | 'inline'; disabled?: boolean; hovering?: boolean }>(),
  { variant: 'overlay', disabled: false, hovering: false },
)
const emit = defineEmits<{ files: [files: File[]] }>()

const ACCEPT = '.epub,.cbz,application/epub+zip'

const input = useTemplateRef<HTMLInputElement>('input')
const selected = ref<File[] | null>(null)
const dragging = ref(false)
let depth = 0

function send(list: Iterable<File> | null | undefined) {
  const files = Array.from(list ?? [])
  if (files.length > 0 && !props.disabled) emit('files', files)
}

function onSelect(files: File[] | null | undefined) {
  send(files)
  selected.value = null
}

function onInputChange() {
  send(input.value?.files)
  if (input.value) input.value.value = ''
}

function hasFiles(event: DragEvent): boolean {
  return event.dataTransfer?.types.includes('Files') ?? false
}

if (props.variant === 'overlay') {
  useEventListener(window, 'dragenter', (event: DragEvent) => {
    if (!hasFiles(event) || props.disabled) return
    event.preventDefault()
    depth++
    dragging.value = true
  })
  useEventListener(window, 'dragover', (event: DragEvent) => {
    if (!hasFiles(event)) return
    event.preventDefault()
    if (event.dataTransfer) event.dataTransfer.dropEffect = props.disabled ? 'none' : 'copy'
  })
  useEventListener(window, 'dragleave', (event: DragEvent) => {
    if (!hasFiles(event)) return
    depth = Math.max(0, depth - 1)
    if (depth === 0) dragging.value = false
  })
  useEventListener(window, 'drop', (event: DragEvent) => {
    if (!hasFiles(event)) return
    event.preventDefault()
    depth = 0
    dragging.value = false
    send(event.dataTransfer?.files)
  })
}

defineExpose({ open: () => input.value?.click() })
</script>

<template>
  <UFileUpload
    v-if="variant === 'inline'"
    :model-value="selected"
    multiple
    :accept="ACCEPT"
    :disabled="disabled"
    :preview="false"
    icon="i-lucide-upload"
    :label="$t('import.drop.title')"
    :description="$t('import.drop.description')"
    class="w-full"
    :ui="{ base: 'border-2 border-accented bg-default py-6', avatar: 'text-primary' }"
    @update:model-value="onSelect"
    @reject="send"
  />

  <template v-else>
    <input
      ref="input"
      type="file"
      multiple
      :accept="ACCEPT"
      class="sr-only"
      tabindex="-1"
      aria-hidden="true"
      @change="onInputChange"
    />
    <Teleport to="body">
      <Transition
        enter-active-class="motion-safe:transition-opacity motion-safe:duration-150"
        leave-active-class="motion-safe:transition-opacity motion-safe:duration-150"
        enter-from-class="opacity-0"
        leave-to-class="opacity-0"
      >
        <div
          v-if="dragging || (hovering && !disabled)"
          class="fixed inset-0 z-50 flex items-center justify-center bg-default/90 p-4 sm:p-8"
          aria-hidden="true"
        >
          <div
            class="flex size-full flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-primary p-6 text-center"
          >
            <UIcon name="i-lucide-upload" class="size-10 text-primary" />
            <p class="font-display text-3xl font-medium text-highlighted">
              {{ $t('import.drop.title') }}
            </p>
            <p class="text-sm text-muted">{{ $t('import.drop.overlay') }}</p>
            <p class="text-xs text-dimmed">{{ $t('import.drop.description') }}</p>
          </div>
        </div>
      </Transition>
    </Teleport>
  </template>
</template>
