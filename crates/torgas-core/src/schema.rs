//! Schéma SQLite partagé entre le desktop (`rusqlite`) et le web (wa-sqlite).

/// Version du schéma, écrite dans `PRAGMA user_version`.
pub const SCHEMA_VERSION: u32 = 1;

/// Script SQL créant toutes les tables (idempotent : `IF NOT EXISTS`).
///
/// Les identifiants sont des UUID v7 en texte, les dates des chaînes ISO 8601
/// (UTC, `2026-01-31T12:00:00.000Z`). Les clés étrangères supposent
/// `PRAGMA foreign_keys = ON`, à activer par l'hôte à chaque connexion.
pub const SCHEMA_SQL: &str = include_str!("schema.sql");

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
}
