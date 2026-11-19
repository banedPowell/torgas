//! Schéma SQLite partagé entre le desktop (`rusqlite`) et le web (wa-sqlite).

use serde::Serialize;

use crate::error::{CoreError, Result};

/// Version du schéma, écrite dans `PRAGMA user_version`.
pub const SCHEMA_VERSION: u32 = 2;

/// Script SQL créant toutes les tables d'une base neuve (idempotent : `IF NOT EXISTS`).
///
/// Les identifiants sont des UUID v7 en texte, les dates des chaînes ISO 8601
/// (UTC, `2026-01-31T12:00:00.000Z`). Les clés étrangères supposent
/// `PRAGMA foreign_keys = ON`, à activer par l'hôte à chaque connexion.
pub const SCHEMA_SQL: &str = include_str!("schema.sql");

/// Migration d'une base existante vers `version` (depuis `version - 1`).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub struct Migration {
    /// Version atteinte une fois le script appliqué.
    pub version: u32,
    /// Script SQL, qui finit par `PRAGMA user_version = <version>;`.
    pub sql: &'static str,
}

/// Migrations par version croissante. Une base neuve reçoit directement [`SCHEMA_SQL`].
pub const MIGRATIONS: &[Migration] = &[Migration {
    version: 2,
    sql: include_str!("migrations/0002_keep_reading_sessions.sql"),
}];

/// Script qui amène une base de la version `from` à [`SCHEMA_VERSION`] : le schéma complet
/// pour une base vide (`0`), sinon les migrations manquantes. `None` si la base est à jour.
///
/// Le script ne contient ni `BEGIN` ni `COMMIT` : l'hôte l'exécute dans une transaction.
/// Le pendant TypeScript (même règle) est `upgradeScript` dans `app/services/core/web/db.worker.ts`.
pub fn upgrade_sql(from: u32) -> Result<Option<String>> {
    if from > SCHEMA_VERSION {
        return Err(CoreError::SchemaTooNew {
            found: from,
            supported: SCHEMA_VERSION,
        });
    }
    if from == SCHEMA_VERSION {
        return Ok(None);
    }
    if from == 0 {
        return Ok(Some(SCHEMA_SQL.to_owned()));
    }
    Ok(Some(
        MIGRATIONS
            .iter()
            .filter(|migration| migration.version > from)
            .map(|migration| migration.sql)
            .collect::<Vec<_>>()
            .join("\n"),
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn schema_declares_its_version() {
        assert!(SCHEMA_SQL.contains(&format!("PRAGMA user_version = {SCHEMA_VERSION};")));
    }

    #[test]
    fn schema_has_all_tables() {
        for table in [
            "series",
            "work",
            "file",
            "library_entry",
            "locator",
            "bookmark",
            "reading_session",
        ] {
            assert!(
                SCHEMA_SQL.contains(&format!("CREATE TABLE IF NOT EXISTS {table} (")),
                "table {table} absente"
            );
        }
    }

    #[test]
    fn migrations_are_ordered_and_reach_the_current_version() {
        let versions: Vec<u32> = MIGRATIONS.iter().map(|m| m.version).collect();
        assert_eq!(versions, (2..=SCHEMA_VERSION).collect::<Vec<_>>());
        for migration in MIGRATIONS {
            assert!(
                migration
                    .sql
                    .contains(&format!("PRAGMA user_version = {};", migration.version)),
                "migration {} sans user_version",
                migration.version
            );
        }
    }

    #[test]
    fn upgrade_sql_picks_schema_or_migrations() {
        assert_eq!(upgrade_sql(0).unwrap().as_deref(), Some(SCHEMA_SQL));
        assert_eq!(upgrade_sql(SCHEMA_VERSION).unwrap(), None);
        assert_eq!(upgrade_sql(1).unwrap().as_deref(), Some(MIGRATIONS[0].sql));
        assert!(matches!(
            upgrade_sql(SCHEMA_VERSION + 1),
            Err(CoreError::SchemaTooNew { .. })
        ));
    }
}
