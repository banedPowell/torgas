/** File d'exécution : chaque tâche démarre quand la précédente est terminée (réussie ou non). */
export interface SerialQueue {
  run<T>(task: () => Promise<T>): Promise<T>
}

/**
 * Exécute les tâches asynchrones une par une, dans l'ordre d'appel. Une opération en plusieurs
 * étapes (vérifier puis écrire) n'est ainsi jamais doublée par une lecture appelée après elle.
 * L'échec d'une tâche est rendu à son appelant et n'arrête pas la file.
 */
export function createSerialQueue(): SerialQueue {
  let tail: Promise<unknown> = Promise.resolve()
  return {
    run<T>(task: () => Promise<T>): Promise<T> {
      const result = tail.then(task)
      tail = result.catch(() => {})
      return result
    },
  }
}
