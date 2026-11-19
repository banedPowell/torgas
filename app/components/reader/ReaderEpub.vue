<script setup lang="ts">
// Pont entre foliate-js (rendu EPUB, chargé à la demande) et l'interface du lecteur.
// La logique (position, marque-pages, réglages, barre) vit dans les composables.
import type { FoliateRelocateDetail, View } from '~/vendor/foliate-js/view.js'
// Fonctions de `utils/` (buildBookCss, readerKeyAction…) : auto-importées par Nuxt.
import type { ReaderAction } from '~/utils/reader'

const props = defineProps<{ workId: string }>()
const emit = defineEmits<{ close: [] }>()

const reader = useReader(() => props.workId)
const { settings, resolvedTheme, update, reset } = useReaderSettings()
const chrome = useReaderChrome()

const root = useTemplateRef<HTMLElement>('root')
const container = useTemplateRef<HTMLElement>('container')
const view = shallowRef<View | null>(null)
const opening = ref(true)
const tocOpen = ref(false)
const settingsOpen = ref(false)
const toc = computed(() => flattenToc(view.value?.book.toc))

const fontFaces = readerFontFaces(window.location.href)
useHead({ style: [{ key: 'reader-fonts', textContent: fontFaces }] })

watch([tocOpen, settingsOpen], ([a, b]) => chrome.setPinned(a || b))
onMounted(reader.load)
onBeforeUnmount(() => view.value?.close())

watch([() => reader.state.value, container], async ([state, el]) => {
  if (state !== 'ready' || !el || view.value) return
  try {
    await import('~/vendor/foliate-js/view.js')
    const el = document.createElement('foliate-view') as View
    el.addEventListener('relocate', (e) =>
      onRelocate((e as CustomEvent<FoliateRelocateDetail>).detail),
    )
    el.addEventListener('load', (e) =>
      onSectionLoad((e as CustomEvent<{ doc: Document }>).detail.doc),
    )
    container.value?.append(el)
    await el.open(reader.file.value!)
    view.value = el
    applyStyles()
    await el.init({ lastLocation: reader.initialCfi.value }).catch(() => el.init({}))
  } catch (e) {
    reader.fail(e)
  } finally {
    opening.value = false
  }
})

function onRelocate(d: FoliateRelocateDetail) {
  reader.relocate({
    cfi: d.cfi,
    progress: d.fraction ?? 0,
    chapter: d.tocItem?.label?.trim() || undefined,
    chapterHref: d.tocItem?.href,
    pageLabel: d.pageItem?.label,
    chapterMinutesLeft: d.time?.section,
  })
}

// Le livre est rendu dans des iframes : on y relaie les taps et le clavier.
function onSectionLoad(doc: Document) {
  doc.addEventListener('keydown', onKey)
  doc.addEventListener('click', (e) => {
    const target = e.target as Element | null
    if (e.defaultPrevented || target?.closest?.('a') || !doc.getSelection()?.isCollapsed) return
    const frame = doc.defaultView?.frameElement?.getBoundingClientRect()
    if (frame) onTap(frame.left + e.clientX)
  })
}

function onTap(clientX: number) {
  const rect = container.value?.getBoundingClientRect()
  if (rect) run(readerTapAction((clientX - rect.left) / rect.width))
}

function run(action: ReaderAction) {
  if (action === 'close') return emit('close')
  if (action === 'toggle') return chrome.toggle()
  if (!view.value) return
  chrome.hide()
  if (action === 'left') void view.value.goLeft()
  else if (action === 'right') void view.value.goRight()
  else if (action === 'next') void view.value.next()
  else void view.value.prev()
}

function onKey(e: KeyboardEvent) {
  const inDialog = !!(e.target as Element | null)?.closest?.('[role="dialog"]')
  const action = readerKeyAction(e)
  if (!action || inDialog || tocOpen.value || settingsOpen.value) return
  e.preventDefault()
  run(action)
}

defineShortcuts({
  arrowleft: (e: KeyboardEvent) => onKey(e),
  arrowright: (e: KeyboardEvent) => onKey(e),
  ' ': (e: KeyboardEvent) => onKey(e),
  'shift_ ': (e: KeyboardEvent) => onKey(e),
  escape: (e: KeyboardEvent) => onKey(e),
})

// Réglages typo et thème → feuille de style du livre (couleurs lues sur les jetons du thème).
function applyStyles() {
  const renderer = view.value?.renderer
  if (!renderer || !root.value) return
  const css = getComputedStyle(root.value)
  renderer.setAttribute('gap', MARGIN_GAP[settings.value.margin])
  renderer.setAttribute('margin', '64px')
  renderer.setStyles?.(
    fontFaces +
      buildBookCss(settings.value, {
        background: css.backgroundColor,
        text: css.color,
        link: css.getPropertyValue('--ui-primary').trim() || css.color,
        dark: resolvedTheme.value === 'dark' || resolvedTheme.value === 'black',
      }),
  )
}
watch([settings, resolvedTheme], applyStyles, { flush: 'post', deep: true })

async function goTo(target: string) {
  tocOpen.value = false
  await view.value?.goTo(target)
}

const failure = computed(() => {
  const state = reader.state.value
  return state === 'error' ? 'unreadable' : state === 'not-found' ? 'notFound' : null
})
</script>

<template>
  <div
    ref="root"
    :data-reader-theme="resolvedTheme"
    class="relative flex-1 overflow-hidden bg-default text-default"
  >
    <div v-if="failure" class="flex h-full items-center justify-center">
      <EmptyState
        icon="i-lucide-file-x"
        :title="$t(`reader.${failure}.title`)"
        :description="$t(`reader.${failure}.description`)"
      >
        <UButton icon="i-lucide-library" :label="$t('reader.back')" to="/" />
      </EmptyState>
    </div>
    <template v-else>
      <div
        ref="container"
        class="absolute inset-0"
        :aria-label="$t('reader.text')"
        role="document"
      />
      <ReaderSkeleton v-if="opening" class="absolute inset-0 bg-default" />

      <ReaderChrome
        :visible="chrome.visible.value && !opening"
        :title="reader.work.value?.title ?? ''"
        :authors="reader.work.value?.authors ?? []"
        :bookmarked="!!reader.currentBookmark.value"
        :position="reader.position.value"
        @show="chrome.show"
        @keep-alive="chrome.keepAlive"
        @close="emit('close')"
        @toc="tocOpen = true"
        @bookmark="reader.toggleBookmark"
        @settings="settingsOpen = true"
        @seek="(f) => view?.goToFraction(f)"
      />

      <ReaderToc
        v-model:open="tocOpen"
        :entries="toc"
        :current-href="reader.position.value?.chapterHref"
        :bookmarks="reader.bookmarks.value"
        @navigate="goTo"
        @open-bookmark="goTo"
        @remove-bookmark="reader.removeBookmark"
      />
      <ReaderSettings
        v-model:open="settingsOpen"
        :settings="settings"
        @update="update"
        @reset="reset"
      />
    </template>
  </div>
</template>
