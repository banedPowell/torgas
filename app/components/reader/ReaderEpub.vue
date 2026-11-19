<script setup lang="ts">
// Pont entre foliate-js (rendu EPUB, chargé à la demande) et l'interface du lecteur.
// La logique (position, marque-pages, réglages, barre) vit dans les composables.
import type { FoliateRelocateDetail, View } from '~/vendor/foliate-js/view.js'
// Fonctions de `utils/` (buildBookCss, readerKeyAction…) : auto-importées par Nuxt.
import type { ReaderAction } from '~/utils/reader'

const props = defineProps<{
  workId: string
  /** Cible où ouvrir le livre (chapitre choisi sur la fiche) au lieu de la dernière position. */
  startAt?: string
}>()
const emit = defineEmits<{ close: [] }>()

const router = useRouter()
const reducedMotion = usePreferredReducedMotion()
const reader = useReader(() => props.workId)
const { settings, resolvedTheme, update, reset } = useReaderSettings()
const chrome = useReaderChrome()

const root = useTemplateRef<HTMLElement>('root')
const container = useTemplateRef<HTMLElement>('container')
const view = shallowRef<View | null>(null)
const opening = ref(true)
const tocOpen = ref(false)
const settingsOpen = ref(false)
const toc = useEpubToc()
const footnotes = useFootnotePreview({ view: () => view.value, bounds: () => root.value })
const rootSize = reactive(useElementSize(root))

// Session de lecture : s'ouvre une fois le livre affiché ; chaque changement de page compte.
const session = useReadingSession(() => props.workId, {
  ready: () => reader.state.value === 'ready' && !opening.value,
  progress: () => reader.position.value?.progress ?? reader.work.value?.progress ?? 0,
  activity: () => reader.position.value,
})

const fontFaces = readerFontFaces(window.location.href)
useHead({ style: [{ key: 'reader-fonts', textContent: fontFaces }] })

watch([tocOpen, settingsOpen], ([a, b]) => chrome.setPinned(a || b))
onMounted(reader.load)
onBeforeUnmount(() => {
  toc.cancel()
  view.value?.close()
})

watch([() => reader.state.value, container], async ([state, el]) => {
  if (state !== 'ready' || !el || view.value) return
  try {
    await import('~/vendor/foliate-js/view.js')
    const el = document.createElement('foliate-view') as View
    el.addEventListener('relocate', (e) =>
      onRelocate((e as CustomEvent<FoliateRelocateDetail>).detail),
    )
    el.addEventListener('load', (e) => {
      const { doc, index } = (e as CustomEvent<{ doc: Document; index: number }>).detail
      onSectionLoad(doc)
      footnotes.listen(doc, index)
    })
    footnotes.attach(el)
    container.value?.append(el)
    await el.open(reader.file.value!)
    // Pages qui glissent (tour de page, fin d'un geste au trackpad) plutôt que de sauter, sauf si
    // le système demande de réduire les animations.
    if (reducedMotion.value !== 'reduce') el.renderer.setAttribute('animated', '')
    view.value = el
    void toc.load(el.book)
    applyStyles()
    if (props.startAt) {
      await el.init({})
      await el.goTo(props.startAt).catch(() => undefined)
      // La cible ne sert qu'à l'ouverture : un rechargement reprend à la position enregistrée.
      void router.replace({ query: {} })
    } else {
      await el.init({ lastLocation: reader.initialCfi.value }).catch(() => el.init({}))
    }
  } catch (e) {
    reader.fail(e)
  } finally {
    opening.value = false
  }
})

// Chapitre courant pris dans le sommaire normalisé (jamais une note comme « [3] ») ; il se
// précise quand le sommaire reconstruit depuis le spine arrive.
let lastDetail: FoliateRelocateDetail | null = null
function onRelocate(d: FoliateRelocateDetail) {
  lastDetail = d
  const entry = toc.locate(d, view.value?.getSectionFractions() ?? [])
  reader.relocate({
    cfi: d.cfi,
    progress: d.fraction ?? 0,
    chapter: entry?.label,
    chapterHref: entry?.href,
    pageLabel: d.pageItem?.label,
    chapterMinutesLeft: d.time?.section,
  })
}
watch(toc.entries, () => lastDetail && onRelocate(lastDetail))

// Le livre est rendu dans des iframes : on y relaie les taps et le clavier.
// Glissement à deux doigts au trackpad, façon Livres d'Apple : le texte suit les doigts (via le
// paginateur de foliate, comme au toucher), puis s'aimante sur la page voisine ou revient.
// Les événements horizontaux sont interceptés : le navigateur n'y voit pas « page précédente ».
const wheelGesture = useWheelGesture(({ commit, offset }) => {
  const renderer = view.value?.renderer
  if (!renderer?.size) return
  // Décalage restant (en pages) pour atteindre la page visée depuis la position actuelle.
  const shift = (commit * renderer.size - offset) / renderer.size
  renderer.snap(shift, shift)
})

function onWheel(e: WheelEvent) {
  const renderer = view.value?.renderer
  if (!renderer || renderer.scrolled || !renderer.size) return
  const { consume, move } = wheelGesture.push(
    {
      deltaX: e.deltaX,
      deltaY: e.deltaY,
      deltaMode: e.deltaMode,
      ctrlKey: e.ctrlKey,
      // Horloge de la page principale : celle des iframes de sections diffère d'une section à l'autre.
      timeStamp: performance.now(),
    },
    renderer.size,
  )
  if (!consume) return
  e.preventDefault()
  if (move) renderer.scrollBy(move, move)
}

function onSectionLoad(doc: Document) {
  session.listen(doc)
  doc.addEventListener('keydown', onKey)
  doc.addEventListener('wheel', onWheel, { passive: false })
  doc.addEventListener('click', (e) => {
    const target = e.target as Element | null
    if (e.defaultPrevented || target?.closest?.('a') || !doc.getSelection()?.isCollapsed) return
    const frame = doc.defaultView?.frameElement?.getBoundingClientRect()
    if (frame) onTap(frame.left + e.clientX, frame.top + e.clientY)
  })
}

// Un tap ferme d'abord l'aperçu de note ouvert ; sinon, selon la zone (voir `tapZone`).
function onTap(clientX: number, clientY: number) {
  const rect = container.value?.getBoundingClientRect()
  if (footnotes.dismiss() || !rect) return
  run(readerTapAction((clientX - rect.left) / rect.width, (clientY - rect.top) / rect.height))
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
  if (e.key === 'Escape' && footnotes.dismiss()) return e.preventDefault()
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
        @click="(e: MouseEvent) => onTap(e.clientX, e.clientY)"
        @wheel="onWheel"
      />
      <ReaderSkeleton v-if="opening" class="absolute inset-0 bg-default" />
      <ReaderFootnote
        v-if="footnotes.note.value"
        :note="footnotes.note.value"
        :bounds="rootSize"
        @close="footnotes.dismiss"
        @go-to="footnotes.goToNote"
        @enter="footnotes.keepOpen"
        @leave="footnotes.scheduleClose"
      />

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
        :entries="toc.entries.value"
        :notes="toc.notes.value"
        :building="toc.building.value"
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
