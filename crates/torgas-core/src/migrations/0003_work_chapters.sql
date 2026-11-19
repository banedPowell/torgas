-- Migration 2 → 3 : une œuvre peut être un chapitre (mangas publiés par chapitre).
-- `chapter` porte son numéro (décimal possible : 1050.5), `chapter_title` son titre éventuel ;
-- `volume` reste le volume qui le contient, quand il est connu.

ALTER TABLE work ADD COLUMN chapter REAL CHECK (chapter IS NULL OR chapter >= 0);
ALTER TABLE work ADD COLUMN chapter_title TEXT;
CREATE INDEX IF NOT EXISTS work_series_chapter_idx ON work (series_id, chapter);

PRAGMA user_version = 3;
