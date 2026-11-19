import { describe, expect, it } from 'vitest'
import { createSerialQueue } from '~/utils/serial'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe('createSerialQueue', () => {
  it('exécute les tâches une par une, dans l’ordre d’appel', async () => {
    const queue = createSerialQueue()
    const log: string[] = []
    const write = deferred<undefined>()

    // Écriture en deux étapes (vérifier puis écrire), puis une lecture appelée après elle.
    const saved = queue.run(async () => {
      log.push('vérifie')
      await write.promise
      log.push('écrit')
    })
    const read = queue.run(async () => {
      log.push('lit')
      return 42
    })

    await Promise.resolve()
    expect(log).toEqual(['vérifie'])
    write.resolve(undefined)
    await saved
    expect(await read).toBe(42)
    expect(log).toEqual(['vérifie', 'écrit', 'lit'])
  })

  it('rend l’échec à son appelant sans bloquer la suite', async () => {
    const queue = createSerialQueue()
    const failed = queue.run(() => Promise.reject(new Error('panne')))
    const next = queue.run(async () => 'ok')
    await expect(failed).rejects.toThrow('panne')
    await expect(next).resolves.toBe('ok')
  })

  it('attend aussi une tâche qui échoue avant de lancer la suivante', async () => {
    const queue = createSerialQueue()
    const gate = deferred<undefined>()
    const log: string[] = []
    const failed = queue.run(async () => {
      await gate.promise
      log.push('échec')
      throw new Error('panne')
    })
    const next = queue.run(async () => void log.push('suite'))
    gate.resolve(undefined)
    await expect(failed).rejects.toThrow()
    await next
    expect(log).toEqual(['échec', 'suite'])
  })
})
