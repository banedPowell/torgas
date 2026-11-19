-- Migration 1 → 2 : les sessions de lecture survivent à la suppression d'une œuvre.
-- `reading_session.work_id` passe de `NOT NULL … ON DELETE CASCADE` à `ON DELETE SET NULL`.
-- SQLite ne modifie pas une clé étrangère en place : la table est reconstruite.

CREATE TABLE reading_session_v2 (
    id              TEXT PRIMARY KEY NOT NULL,
    work_id         TEXT REFERENCES work (id) ON DELETE SET NULL,
    started_at      TEXT NOT NULL,
    ended_at        TEXT CHECK (ended_at IS NULL OR ended_at >= started_at),
    minutes         REAL NOT NULL DEFAULT 0 CHECK (minutes >= 0),
    progress_start  REAL CHECK (progress_start IS NULL OR progress_start BETWEEN 0 AND 1),
    progress_end    REAL CHECK (progress_end IS NULL OR progress_end BETWEEN 0 AND 1)
);
INSERT INTO reading_session_v2
    (id, work_id, started_at, ended_at, minutes, progress_start, progress_end)
SELECT id, work_id, started_at, ended_at, minutes, progress_start, progress_end
FROM reading_session;
DROP TABLE reading_session;
ALTER TABLE reading_session_v2 RENAME TO reading_session;
CREATE INDEX IF NOT EXISTS reading_session_work_idx ON reading_session (work_id, started_at);

PRAGMA user_version = 2;
