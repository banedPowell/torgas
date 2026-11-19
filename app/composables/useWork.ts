import type { ReadingDirection, ReadingStatus, Work } from '~/types/core'
import type { SeriesView, WorkTarget } from '~/types/work'
import type { LoadState } from './useLibrary'

/**
 * Fiche d'une œuvre ou d'une série. L'identifiant de la route peut être celui d'une série ou
 * d'une œuvre (voir `resolveTarget`) : une œuvre rattachée à une série ouvre la série.
 */
export function useWork(id: MaybeRefOrGetter<string>) {
  const core = useCore()
  const library = useLibrary()
  const deletion = useWorkDeletion()
  const toast = useToast()
  const { t } = useNuxtApp().$i18n

  const target = shallowRef<WorkTarget | null>(null)
  const state = ref<LoadState>('idle')
  const error = ref<string | null>(null)
  const saving = ref(false)
  let request = 0

  /** Charge la fiche ; `quiet` la rafraîchit sans repasser par l'état de chargement. */
  async function load(options: { quiet?: boolean } = {}): Promise<void> {
    const requested = toValue(id)
    const current = ++request
    if (!options.quiet) state.value = 'loading'
    error.value = null
    try {
      let resolved: WorkTarget | null
      const direct = await core.getWork(requested)
      if (direct && !direct.seriesId) {
        resolved = { kind: 'work', work: direct }
      } else {
        const [works, series] = await Promise.all([core.listWorks(), core.listSeries()])
        resolved = resolveTarget(requested, works, series)
      }
      if (current !== request) return
      target.value = resolved
      state.value = 'ready'
    } catch (e) {
      if (current !== request) return
      target.value = null
      error.value = e instanceof Error ? e.message : String(e)
      state.value = 'error'
    }
  }

  watch(
    () => toValue(id),
    () => load(),
    { immediate: true },
  )

  const work = computed(() => (target.value?.kind === 'work' ? target.value.work : null))
  const series = computed(() => (target.value?.kind === 'series' ? target.value.series : null))
  /** Œuvres de la série : volumes entiers et chapitres. */
  const seriesWorks = computed(() => (target.value?.kind === 'series' ? target.value.works : []))
  const split = computed(() => splitSeriesWorks(seriesWorks.value))
  const volumes = computed(() => split.value.volumes)
  // Chapitres : fichiers à part, et chapitres retrouvés dans les volumes (`109-00.jpg`…).
  const volumeChapters = useVolumeChapters(volumes)
  const chapters = computed(() => [
    ...split.value.chapters,
    ...seriesInnerChapters(volumes.value, volumeChapters.value, split.value.chapters),
  ])
  const isSeries = computed(() => target.value?.kind === 'series')
  /** Volumes ou chapitres : la bascule n'apparaît que si la série a les deux. */
  const view = ref<SeriesView>('volumes')
  const hasBothViews = computed(() => volumes.value.length > 0 && chapters.value.length > 0)
  watch(
    () => series.value?.id,
    () => (view.value = defaultSeriesView(volumes.value, split.value.chapters)),
    { immediate: true },
  )
  const viewWorks = computed(() => (view.value === 'chapters' ? chapters.value : volumes.value))
  const meta = computed(() => (target.value ? describeTarget(target.value) : null))
  const missing = computed(() => missingVolumes(volumes.value))
  const rows = computed(() => buildVolumeRows(volumes.value))
  const next = computed(() => nextVolume(volumes.value))
  const upcomingChapter = computed(() => nextChapter(chapters.value))
  const summary = computed(() =>
    isSeries.value ? summarizeSeries(viewWorks.value, view.value) : null,
  )
  const status = computed<ReadingStatus | null>(() => {
    if (work.value) return work.value.status
    return series.value ? deriveSeriesStatus(seriesWorks.value) : null
  })
  /** Progression globale, de 0 à 1. */
  const progress = computed(() => work.value?.progress ?? summary.value?.progress ?? 0)
  /**
   * Ce que « Lire » ouvre : l'œuvre, ou le prochain volume (ou chapitre, selon la vue) ; le
   * premier si tout est terminé.
   */
  const readTarget = computed<Work | null>(() => {
    if (work.value) return work.value
    const upcoming = view.value === 'chapters' ? upcomingChapter.value : next.value
    return upcoming ?? viewWorks.value[0] ?? seriesWorks.value[0] ?? null
  })
  const action = computed(() => (readTarget.value ? readAction(readTarget.value) : null))

  /** Ce que « Supprimer de la bibliothèque » retire : l'œuvre, ou toute la série. */
  const deletable = computed<Work[]>(() => (work.value ? [work.value] : seriesWorks.value))

  /** Supprime l'œuvre ou la série ; renvoie `true` si c'est fait (erreur signalée par un toast). */
  function remove(): Promise<boolean> {
    return deletion.deleteWorks(deletable.value)
  }

  /** La bibliothèque affiche un statut et une progression : on la recharge si elle l'est déjà. */
  function refreshLibrary() {
    if (library.state.value !== 'idle') void library.load()
  }

  async function setStatus(value: ReadingStatus): Promise<boolean> {
    const current = work.value
    if (!current || current.status === value || saving.value) return false
    saving.value = true
    try {
      await core.setStatus(current.id, value)
      target.value = { kind: 'work', work: { ...current, status: value } }
      refreshLibrary()
      return true
    } catch (e) {
      toast.add({
        title: t('work.status.error'),
        description: e instanceof Error ? e.message : String(e),
        icon: 'i-lucide-circle-alert',
        color: 'error',
      })
      return false
    } finally {
      saving.value = false
    }
  }

  async function setDirection(value: ReadingDirection): Promise<boolean> {
    const current = target.value
    if (current?.kind !== 'series' || current.series.direction === value || saving.value) {
      return false
    }
    saving.value = true
    try {
      await core.setSeriesDirection(current.series.id, value)
      target.value = { ...current, series: { ...current.series, direction: value } }
      return true
    } catch (e) {
      toast.add({
        title: t('work.direction.error'),
        description: e instanceof Error ? e.message : String(e),
        icon: 'i-lucide-circle-alert',
        color: 'error',
      })
      return false
    } finally {
      saving.value = false
    }
  }

  return {
    state: readonly(state),
    error: readonly(error),
    saving: readonly(saving),
    deleting: deletion.deleting,
    work,
    series,
    volumes,
    chapters,
    view,
    hasBothViews,
    isSeries,
    meta,
    missing,
    rows,
    next,
    nextChapter: upcomingChapter,
    summary,
    status,
    progress,
    readTarget,
    action,
    load,
    setStatus,
    setDirection,
    deletable,
    remove,
  }
}
