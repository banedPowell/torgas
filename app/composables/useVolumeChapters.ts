import type { VolumeChapter, Work } from '~/types/core'

const CACHE_PREFIX = 'torgas:volume-chapters:'

function readCache(id: string): VolumeChapter[] | null {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + id)
    return raw ? (JSON.parse(raw) as VolumeChapter[]) : null
  } catch {
    return null
  }
}

function writeCache(id: string, chapters: VolumeChapter[]) {
  try {
    localStorage.setItem(CACHE_PREFIX + id, JSON.stringify(chapters))
  } catch {
    // Stockage plein ou indisponible : on relira le volume la prochaine fois.
  }
}

/** Volume lu page par page : CBZ, ou manga EPUB fait d'images. */
function isPaged(work: Work): boolean {
  return work.format === 'cbz' || (work.kind === 'comic' && (work.pageCount ?? 0) > 0)
}

/**
 * Chapitres contenus dans les volumes d'une série (d'après le nom de leurs pages), cherchés un
 * volume après l'autre et gardés en cache : le fichier d'un volume ne change jamais.
 */
export function useVolumeChapters(volumes: MaybeRefOrGetter<readonly Work[]>) {
  const core = useCore()
  const found = shallowRef<Record<string, VolumeChapter[]>>({})
  let run = 0

  watch(
    () =>
      toValue(volumes)
        .map((v) => v.id)
        .join(','),
    async () => {
      const current = ++run
      const list = toValue(volumes).filter(isPaged)
      const result: Record<string, VolumeChapter[]> = {}
      const missing: Work[] = []
      for (const volume of list) {
        const cached = readCache(volume.id)
        if (cached) result[volume.id] = cached
        else missing.push(volume)
      }
      found.value = { ...result }
      for (const volume of missing) {
        try {
          const chapters = await core.getVolumeChapters(volume.id)
          if (current !== run) return
          writeCache(volume.id, chapters)
          found.value = { ...found.value, [volume.id]: chapters }
        } catch {
          // Volume illisible : il reste sans chapitres.
        }
      }
    },
    { immediate: true },
  )

  return found
}

/** Oublie les chapitres gardés en cache d'œuvres supprimées. */
export function forgetVolumeChapters(ids: readonly string[]) {
  for (const id of ids) {
    try {
      localStorage.removeItem(CACHE_PREFIX + id)
    } catch {
      // Rien à faire.
    }
  }
}
