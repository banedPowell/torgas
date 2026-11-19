import type { ReadingDirection, ReadingStatus, Work } from '~/types/core'
import type { WorkTarget } from '~/types/work'
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

  async function load(): Promise<void> {
    const requested = toValue(id)
    const current = ++request
    state.value = 'loading'
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

  watch(() => toValue(id), load, { immediate: true })

  const work = computed(() => (target.value?.kind === 'work' ? target.value.work : null))
  const series = computed(() => (target.value?.kind === 'series' ? target.value.series : null))
  const volumes = computed(() => (target.value?.kind === 'series' ? target.value.volumes : []))
  const isSeries = computed(() => target.value?.kind === 'series')
  const meta = computed(() => (target.value ? describeTarget(target.value) : null))
  const missing = computed(() => missingVolumes(volumes.value))
  const rows = computed(() => buildVolumeRows(volumes.value))
  const next = computed(() => nextVolume(volumes.value))
  const summary = computed(() => (isSeries.value ? summarizeSeries(volumes.value) : null))
  const status = computed<ReadingStatus | null>(() => {
    if (work.value) return work.value.status
    return series.value ? deriveSeriesStatus(volumes.value) : null
  })
  /** Progression globale, de 0 à 1. */
  const progress = computed(() => work.value?.progress ?? summary.value?.progress ?? 0)
  /** Ce que « Lire » ouvre : l'œuvre, ou le prochain volume (le premier si tout est terminé). */
  const readTarget = computed<Work | null>(
    () => work.value ?? next.value ?? volumes.value[0] ?? null,
  )
  const action = computed(() => (readTarget.value ? readAction(readTarget.value) : null))

  /** Ce que « Supprimer de la bibliothèque » retire : l'œuvre, ou tous les volumes de la série. */
  const deletable = computed<Work[]>(() => (work.value ? [work.value] : volumes.value))

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
      toast.add({
        title: t('work.status.updated', { status: t(`status.${value}`) }),
        icon: 'i-lucide-circle-check',
        color: 'success',
      })
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
      toast.add({
        title: t('work.direction.updated', { direction: t(`work.direction.${value}`) }),
        icon: 'i-lucide-circle-check',
        color: 'success',
      })
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
    isSeries,
    meta,
    missing,
    rows,
    next,
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
