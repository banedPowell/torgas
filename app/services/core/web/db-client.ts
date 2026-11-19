import type { Request, Response, Row, SqlValue, Statement } from './protocol'

/**
 * Client du worker SQLite : chaque appel devient un message numéroté, la réponse résout la
 * promesse correspondante. Le worker traite les messages dans l'ordre d'arrivée.
 */
export class DbClient {
  private readonly worker: Worker
  private nextId = 1
  private readonly pending = new Map<
    number,
    { resolve: (rows: Row[]) => void; reject: (error: Error) => void }
  >()

  constructor() {
    this.worker = new Worker(new URL('./db.worker.ts', import.meta.url), {
      type: 'module',
      name: 'torgas-db',
    })
    this.worker.onmessage = ({ data }: MessageEvent<Response>) => {
      const call = this.pending.get(data.id)
      if (!call) return
      this.pending.delete(data.id)
      if (data.ok) call.resolve(data.rows ?? [])
      else call.reject(new Error(data.error))
    }
    this.worker.onerror = (event) => {
      event.preventDefault()
      const error = new Error(event.message || 'Le worker SQLite a échoué')
      for (const call of this.pending.values()) call.reject(error)
      this.pending.clear()
    }
  }

  private call(request: Request): Promise<Row[]> {
    const id = this.nextId++
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.worker.postMessage({ id, request })
    })
  }

  async init(schemaSql: string, schemaVersion: number): Promise<void> {
    await this.call({ op: 'init', schemaSql, schemaVersion })
  }

  query(sql: string, params?: SqlValue[]): Promise<Row[]> {
    return this.call({ op: 'query', sql, params })
  }

  async first(sql: string, params?: SqlValue[]): Promise<Row | undefined> {
    return (await this.query(sql, params))[0]
  }

  /** Exécute plusieurs écritures dans une seule transaction. */
  async batch(statements: Statement[]): Promise<void> {
    await this.call({ op: 'batch', statements })
  }

  async writeFile(path: string, bytes: Uint8Array): Promise<void> {
    await this.call({ op: 'write', path, bytes })
  }

  async removeFile(path: string): Promise<void> {
    await this.call({ op: 'remove', path })
  }
}
