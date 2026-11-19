<script setup lang="ts">
/**
 * Défilement vertical continu. Seules les pages proches de l'écran sont montées
 * (IntersectionObserver) ; les autres gardent leur hauteur mesurée.
 */
const props = defineProps<{
  pageCount: number
  /** Page courante (à partir de 0) : un changement venu d'ailleurs fait défiler jusqu'à elle. */
  page: number
  resolve: (page: number, fresh?: boolean) => Promise<string>
}>()

const emit = defineEmits<{ visible: [page: number]; end: [visible: boolean] }>()

const scroller = useTemplateRef<HTMLElement>('scroller')
const endSentinel = useTemplateRef<HTMLElement>('endSentinel')
const near = ref(new Set<number>([props.page]))
const heights = reactive(new Map<number, number>())
const observers: IntersectionObserver[] = []
// Dernière page signalée par le défilement, pour ne pas y re-défiler.
let reported = props.page

function pageOf(el: Element): number {
  return Number((el as HTMLElement).dataset.page)
}

function observe(
  options: IntersectionObserverInit,
  onEntry: (e: IntersectionObserverEntry) => void,
) {
  const observer = new IntersectionObserver((entries) => entries.forEach(onEntry), options)
  observers.push(observer)
  return observer
}

onMounted(async () => {
  const root = scroller.value
  if (!root) return
  const items = [...root.querySelectorAll('[data-page]')]

  // Montage paresseux : 1,5 écran au-dessus et au-dessous.
  const mount = observe({ root, rootMargin: '150% 0px' }, (entry) => {
    const page = pageOf(entry.target)
    const next = new Set(near.value)
    if (entry.isIntersecting) next.add(page)
    else {
      heights.set(page, entry.boundingClientRect.height)
      next.delete(page)
    }
    near.value = next
  })
  // Page courante : celle qui croise le milieu de l'écran.
  const current = observe({ root, rootMargin: '-50% 0px -50% 0px' }, (entry) => {
    if (!entry.isIntersecting) return
    reported = pageOf(entry.target)
    emit('visible', reported)
  })
  items.forEach((el) => {
    mount.observe(el)
    current.observe(el)
  })
  if (endSentinel.value) {
    observe({ root }, (entry) => emit('end', entry.isIntersecting)).observe(endSentinel.value)
  }

  await nextTick()
  scrollTo(props.page)
})

function scrollTo(page: number) {
  reported = page
  scroller.value?.querySelector(`[data-page="${page}"]`)?.scrollIntoView({ block: 'start' })
}

watch(
  () => props.page,
  (page) => page !== reported && scrollTo(page),
)

onBeforeUnmount(() => observers.forEach((o) => o.disconnect()))
</script>

<template>
  <div ref="scroller" class="h-full overflow-y-auto overscroll-contain">
    <div class="mx-auto flex w-full max-w-3xl flex-col">
      <div
        v-for="index in pageCount"
        :key="index - 1"
        :data-page="index - 1"
        :style="
          !near.has(index - 1) && heights.get(index - 1)
            ? { height: `${heights.get(index - 1)}px` }
            : undefined
        "
      >
        <ComicPage
          v-if="near.has(index - 1)"
          :page="index - 1"
          :total="pageCount"
          fit="width"
          :resolve="resolve"
        />
        <div v-else-if="!heights.has(index - 1)" class="aspect-[2/3] w-full" />
      </div>
      <div ref="endSentinel" class="px-4 py-10">
        <slot name="end" />
      </div>
    </div>
  </div>
</template>
