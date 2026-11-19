import type { Migration } from './protocol'

export interface SchemaScripts {
  /** Schéma complet d'une base neuve (`schemaSql()` de `torgas-wasm`). */
  schemaSql: string
  schemaVersion: number
  /** Migrations par version croissante (`migrations()` de `torgas-wasm`). */
  migrations: Migration[]
}

/**
 * Script qui amène une base de la version `from` à la version courante : le schéma complet pour
 * une base vide (`0`), sinon les migrations manquantes ; `null` si la base est à jour. Même
 * règle que `upgrade_sql` dans `crates/torgas-core/src/schema.rs`. Sans `BEGIN`/`COMMIT` : le
 * worker l'exécute dans sa transaction.
 */
export function upgradeScript(from: number, scripts: SchemaScripts): string | null {
  const { schemaSql, schemaVersion, migrations } = scripts
  if (from > schemaVersion) {
    throw new Error(`Schéma en version ${from}, version ${schemaVersion} au plus attendue`)
  }
  if (from === schemaVersion) return null
  if (from === 0) return schemaSql
  return migrations
    .filter((migration) => migration.version > from)
    .map((migration) => migration.sql)
    .join('\n')
}
