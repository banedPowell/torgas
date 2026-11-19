/** Messages échangés entre `WebBridge` et le worker SQLite (`db.worker.ts`). */

export type SqlValue = string | number | null | Uint8Array
export type Row = Record<string, SqlValue | bigint>

export interface Statement {
  sql: string
  params?: SqlValue[]
}

/** Migration d'une base existante vers `version` (`torgas_core::schema::MIGRATIONS`). */
export interface Migration {
  version: number
  sql: string
}

export type Request =
  /** Ouvre la base et l'amène à `schemaVersion` (schéma complet ou migrations manquantes). */
  | { op: 'init'; schemaSql: string; schemaVersion: number; migrations: Migration[] }
  | { op: 'query'; sql: string; params?: SqlValue[] }
  /** Plusieurs écritures dans une seule transaction (tout ou rien). */
  | { op: 'batch'; statements: Statement[] }
  /** Écrit un fichier dans l'OPFS (`dossier/nom`), en remplaçant l'existant. */
  | { op: 'write'; path: string; bytes: Uint8Array }
  | { op: 'remove'; path: string }

export type Response =
  { id: number; ok: true; rows?: Row[] } | { id: number; ok: false; error: string }
