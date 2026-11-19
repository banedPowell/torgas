-- Schéma de la bibliothèque Torgas (version 2), appliqué tel quel à une base neuve.
-- Une base plus ancienne passe par les migrations de `migrations/` (voir `schema.rs`).
-- Partagé entre le desktop (rusqlite) et le web (wa-sqlite).
-- Identifiants : UUID v7 en TEXT. Dates : TEXT ISO 8601 UTC.
-- Les clés étrangères supposent `PRAGMA foreign_keys = ON` côté connexion.

CREATE TABLE IF NOT EXISTS series (
    id          TEXT PRIMARY KEY NOT NULL,
    title       TEXT NOT NULL CHECK (length(trim(title)) > 0),
    direction   TEXT NOT NULL DEFAULT 'ltr' CHECK (direction IN ('ltr', 'rtl')),
    created_at  TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS series_title_idx ON series (title COLLATE NOCASE);

CREATE TABLE IF NOT EXISTS work (
    id          TEXT PRIMARY KEY NOT NULL,
    title       TEXT NOT NULL,
    -- Tableau JSON de chaînes, dans l'ordre d'affichage.
    authors     TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(authors)),
    kind        TEXT NOT NULL CHECK (kind IN ('novel', 'comic')),
    language    TEXT,
    -- URL de la miniature, propre à l'hôte (torgas://, chemin OPFS…).
    cover_url   TEXT,
    series_id   TEXT REFERENCES series (id) ON DELETE SET NULL,
    volume      REAL CHECK (volume IS NULL OR volume >= 0),
    page_count  INTEGER CHECK (page_count IS NULL OR page_count >= 0),
    created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS work_series_idx ON work (series_id, volume);
CREATE INDEX IF NOT EXISTS work_title_idx ON work (title COLLATE NOCASE);

CREATE TABLE IF NOT EXISTS file (
    id          TEXT PRIMARY KEY NOT NULL,
    work_id     TEXT NOT NULL REFERENCES work (id) ON DELETE CASCADE,
    format      TEXT NOT NULL CHECK (format IN ('epub', 'cbz')),
    sha256      TEXT NOT NULL UNIQUE CHECK (length(sha256) = 64),
    size_bytes  INTEGER NOT NULL CHECK (size_bytes >= 0),
    -- Emplacement local (chemin desktop ou clé OPFS) ; NULL si non copié.
    path        TEXT,
    added_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS file_work_idx ON file (work_id);

CREATE TABLE IF NOT EXISTS library_entry (
    work_id      TEXT PRIMARY KEY NOT NULL REFERENCES work (id) ON DELETE CASCADE,
    status       TEXT NOT NULL DEFAULT 'to_read'
                 CHECK (status IN ('to_read', 'reading', 'finished', 'abandoned', 'paused')),
    progress     REAL NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 1),
    added_at     TEXT NOT NULL,
    started_at   TEXT,
    finished_at  TEXT,
    last_read_at TEXT
);
CREATE INDEX IF NOT EXISTS library_entry_status_idx ON library_entry (status);
CREATE INDEX IF NOT EXISTS library_entry_last_read_idx ON library_entry (last_read_at);
CREATE INDEX IF NOT EXISTS library_entry_added_idx ON library_entry (added_at);

-- Dernière position de lecture (une par œuvre).
CREATE TABLE IF NOT EXISTS locator (
    work_id     TEXT PRIMARY KEY NOT NULL REFERENCES work (id) ON DELETE CASCADE,
    format      TEXT NOT NULL CHECK (format IN ('epub', 'cbz')),
    cfi         TEXT,
    page        INTEGER CHECK (page IS NULL OR page >= 0),
    progress    REAL NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 1),
    updated_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS bookmark (
    id          TEXT PRIMARY KEY NOT NULL,
    work_id     TEXT NOT NULL REFERENCES work (id) ON DELETE CASCADE,
    format      TEXT NOT NULL CHECK (format IN ('epub', 'cbz')),
    cfi         TEXT,
    page        INTEGER CHECK (page IS NULL OR page >= 0),
    progress    REAL NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 1),
    label       TEXT NOT NULL DEFAULT '',
    created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS bookmark_work_idx ON bookmark (work_id, created_at);

-- Sessions de lecture : source de vérité du temps de lecture (et de l'XP plus tard).
-- Elles survivent à la suppression de l'œuvre (`work_id` passe à NULL) : le temps lu reste acquis.
CREATE TABLE IF NOT EXISTS reading_session (
    id              TEXT PRIMARY KEY NOT NULL,
    work_id         TEXT REFERENCES work (id) ON DELETE SET NULL,
    started_at      TEXT NOT NULL,
    ended_at        TEXT CHECK (ended_at IS NULL OR ended_at >= started_at),
    minutes         REAL NOT NULL DEFAULT 0 CHECK (minutes >= 0),
    progress_start  REAL CHECK (progress_start IS NULL OR progress_start BETWEEN 0 AND 1),
    progress_end    REAL CHECK (progress_end IS NULL OR progress_end BETWEEN 0 AND 1)
);
CREATE INDEX IF NOT EXISTS reading_session_work_idx ON reading_session (work_id, started_at);

PRAGMA user_version = 2;
