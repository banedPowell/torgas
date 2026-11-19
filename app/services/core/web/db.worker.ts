/**
 * Worker de la bibliothèque web : SQLite (wa-sqlite, VFS `OPFSCoopSyncVFS`) et écriture des
 * fichiers dans l'OPFS. Les accès synchrones à l'OPFS (`createSyncAccessHandle`) n'existent
 * que dans un worker : c'est ce qui rend le stockage fiable dans Chrome, Firefox et Safari.
 * Voir docs/adr/0004-stockage-web.md.
 *
 * Les messages sont traités un par un, dans l'ordre : une transaction (`batch`) n'est jamais
 * entrelacée avec une autre requête.
 */
import * as SQLite from '@journeyapps/wa-sqlite'
import SQLiteESMFactory from '@journeyapps/wa-sqlite/dist/wa-sqlite.mjs'
import { OPFSCoopSyncVFS } from '@journeyapps/wa-sqlite/src/examples/OPFSCoopSyncVFS.js'
import wasmUrl from '@journeyapps/wa-sqlite/dist/wa-sqlite.wasm?url'
import { upgradeScript } from './migrations'
import type { Migration, Request, Response, Row, SqlValue } from './protocol'

const DB_NAME = 'torgas.sqlite3'
const DB_DIR = 'db'

interface SyncAccessHandle {
  truncate(size: number): void
  write(buffer: Uint8Array, options?: { at: number }): number
  flush(): void
  close(): void
}

interface WorkerScope {
  onmessage: ((event: MessageEvent<{ id: number; request: Request }>) => void) | null
  postMessage(message: Response): void
}

const scope = globalThis as unknown as WorkerScope

let sqlite3: SQLiteAPI | null = null
let db = 0

async function opfsDir(path: string, create: boolean): Promise<FileSystemDirectoryHandle> {
  let dir = await navigator.storage.getDirectory()
  for (const part of path.split('/').filter(Boolean)) {
    dir = await dir.getDirectoryHandle(part, { create })
  }
  return dir
}

function splitPath(path: string): [string, string] {
  const index = path.lastIndexOf('/')
  return [path.slice(0, Math.max(index, 0)), path.slice(index + 1)]
}

async function open(
  schemaSql: string,
  schemaVersion: number,
  migrations: Migration[],
): Promise<void> {
  if (sqlite3) return
  const module = await SQLiteESMFactory({ locateFile: () => wasmUrl })
  const api = SQLite.Factory(module)
  const vfs = await OPFSCoopSyncVFS.create('torgas-opfs', module, {
    getRoot: () => opfsDir(DB_DIR, true),
  })
  api.vfs_register(vfs, true)
  db = await api.open_v2(DB_NAME)
  sqlite3 = api
  await api.exec(db, 'PRAGMA foreign_keys = ON')
  // Version relue sous verrou d'écriture : deux onglets ouverts ensemble ne migrent pas deux fois.
  await api.exec(db, 'BEGIN IMMEDIATE')
  try {
    const [row] = await query('PRAGMA user_version')
    const script = upgradeScript(Number(row?.user_version ?? 0), {
      schemaSql,
      schemaVersion,
      migrations,
    })
    if (script) await api.exec(db, script)
    await api.exec(db, 'COMMIT')
  } catch (error) {
    await api.exec(db, 'ROLLBACK').catch(() => {})
    throw error
  }
}

function api(): SQLiteAPI {
  if (!sqlite3) throw new Error('Base non initialisée')
  return sqlite3
}

async function query(sql: string, params: SqlValue[] = []): Promise<Row[]> {
  const s = api()
  const rows: Row[] = []
  for await (const stmt of s.statements(db, sql)) {
    if (params.length) s.bind_collection(stmt, params)
    const columns = s.column_names(stmt)
    while ((await s.step(stmt)) === SQLite.SQLITE_ROW) {
      const values = s.row(stmt)
      rows.push(Object.fromEntries(columns.map((name, i) => [name, values[i] ?? null])) as Row)
    }
  }
  return rows
}

async function batch(statements: { sql: string; params?: SqlValue[] }[]): Promise<void> {
  const s = api()
  await s.exec(db, 'BEGIN IMMEDIATE')
  try {
    for (const { sql, params } of statements) await query(sql, params)
    await s.exec(db, 'COMMIT')
  } catch (error) {
    await s.exec(db, 'ROLLBACK').catch(() => {})
    throw error
  }
}

async function writeFile(path: string, bytes: Uint8Array): Promise<void> {
  const [dirPath, name] = splitPath(path)
  const dir = await opfsDir(dirPath, true)
  const file = await dir.getFileHandle(name, { create: true })
  const handle = await (
    file as unknown as { createSyncAccessHandle(): Promise<SyncAccessHandle> }
  ).createSyncAccessHandle()
  try {
    handle.truncate(0)
    handle.write(bytes, { at: 0 })
    handle.flush()
  } finally {
    handle.close()
  }
}

async function removeFile(path: string): Promise<void> {
  const [dirPath, name] = splitPath(path)
  try {
    await (await opfsDir(dirPath, false)).removeEntry(name)
  } catch (error) {
    if ((error as DOMException)?.name !== 'NotFoundError') throw error
  }
}

async function handle(request: Request): Promise<Row[] | undefined> {
  switch (request.op) {
    case 'init':
      return void (await open(request.schemaSql, request.schemaVersion, request.migrations))
    case 'query':
      return query(request.sql, request.params)
    case 'batch':
      return void (await batch(request.statements))
    case 'write':
      return void (await writeFile(request.path, request.bytes))
    case 'remove':
      return void (await removeFile(request.path))
  }
}

let queue: Promise<unknown> = Promise.resolve()

scope.onmessage = ({ data: { id, request } }) => {
  queue = queue.then(async () => {
    try {
      scope.postMessage({ id, ok: true, rows: await handle(request) })
    } catch (error) {
      scope.postMessage({
        id,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  })
}
