/**
 * Requêtes SQL du `WebBridge`, alignées sur `crates/torgas-core/src/db.rs` (même schéma, mêmes
 * sémantiques). Toute évolution de `db.rs` se reporte ici.
 */
import type { Bookmark, Locator, Series, Work } from '~/types/core'
import { FINISHED_THRESHOLD } from '../status'
import type { Row } from './protocol'

export const WORK_SELECT = `
  SELECT w.id, w.title, w.authors, w.kind, w.language, w.cover_url, w.series_id, w.volume,
         f.format, f.sha256, f.size_bytes, w.page_count,
         le.added_at, le.status, le.progress, le.last_read_at
  FROM work w
  JOIN library_entry le ON le.work_id = w.id
  JOIN file f ON f.id = (
    SELECT id FROM file WHERE work_id = w.id ORDER BY added_at, id LIMIT 1
  )`

export const LIST_WORKS = `${WORK_SELECT} ORDER BY le.added_at DESC, w.id DESC`
export const GET_WORK = `${WORK_SELECT} WHERE w.id = ?`
export const FIND_BY_SHA256 = `${WORK_SELECT} WHERE w.id = (SELECT work_id FROM file WHERE sha256 = ?)`
export const FILE_PATH = 'SELECT path FROM file WHERE work_id = ? ORDER BY added_at, id LIMIT 1'

export const LIST_SERIES = 'SELECT id, title, direction FROM series ORDER BY title COLLATE NOCASE'
export const SET_SERIES_DIRECTION = 'UPDATE series SET direction = ?2 WHERE id = ?1 RETURNING id'

/** Série créée si absente (titre comparé sans casse, index unique `series_title_idx`). */
export const INSERT_SERIES = `INSERT INTO series (id, title, direction, created_at)
  SELECT ?1, ?2, 'ltr', ?3
  WHERE NOT EXISTS (SELECT 1 FROM series WHERE title = ?2 COLLATE NOCASE)`

export const INSERT_WORK = `INSERT INTO work (id, title, authors, kind, language, cover_url,
    series_id, volume, page_count, created_at)
  VALUES (?1, ?2, ?3, ?4, ?5, ?6,
    (SELECT id FROM series WHERE title = ?7 COLLATE NOCASE), ?8, ?9, ?10)`

export const INSERT_FILE = `INSERT INTO file (id, work_id, format, sha256, size_bytes, path, added_at)
  VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`

export const INSERT_ENTRY = `INSERT INTO library_entry (work_id, status, progress, added_at)
  VALUES (?1, 'to_read', 0, ?2)`

/** Liste d'identifiants passée en un seul paramètre, tableau JSON (`["a","b"]`). */
const IDS_PARAM = '(SELECT value FROM json_each(?1))'

/** Fichiers (livre, couverture) des œuvres à supprimer. */
export const DELETED_FILES = `SELECT f.work_id, f.path, w.cover_url FROM file f
  JOIN work w ON w.id = f.work_id
  WHERE f.work_id IN ${IDS_PARAM}`

/**
 * Supprime les œuvres : fichier, entrée, position et marque-pages suivent (`ON DELETE CASCADE`),
 * les sessions de lecture restent, détachées (`ON DELETE SET NULL`).
 */
export const DELETE_WORKS = `DELETE FROM work WHERE id IN ${IDS_PARAM}`

/** Séries restées sans volume (une série n'existe que par ses volumes). */
export const DELETE_EMPTY_SERIES = `DELETE FROM series
  WHERE NOT EXISTS (SELECT 1 FROM work WHERE work.series_id = series.id)`

export const SET_STATUS = `UPDATE library_entry SET
    status = ?2,
    started_at = CASE WHEN ?2 = 'reading' THEN COALESCE(started_at, ?3) ELSE started_at END,
    finished_at = CASE WHEN ?2 = 'finished' THEN ?3 ELSE finished_at END
  WHERE work_id = ?1 RETURNING work_id`

export const UPSERT_LOCATOR = `INSERT INTO locator (work_id, format, cfi, page, progress, updated_at)
  VALUES (?1, ?2, ?3, ?4, ?5, ?6)
  ON CONFLICT (work_id) DO UPDATE SET
    format = excluded.format, cfi = excluded.cfi, page = excluded.page,
    progress = excluded.progress, updated_at = excluded.updated_at`

/** Une progression positive passe l'œuvre « en cours », 100 % « terminée » (définitif). */
export const UPDATE_PROGRESS = `UPDATE library_entry SET
    progress = ?2,
    last_read_at = ?3,
    status = CASE
      WHEN ?2 >= ${FINISHED_THRESHOLD} THEN 'finished'
      WHEN status = 'finished' THEN status
      WHEN ?2 > 0 THEN 'reading'
      ELSE status END,
    started_at = CASE WHEN ?2 > 0 THEN COALESCE(started_at, ?3) ELSE started_at END,
    finished_at = CASE
      WHEN ?2 >= ${FINISHED_THRESHOLD} AND status <> 'finished' THEN ?3 ELSE finished_at END
  WHERE work_id = ?1`

export const GET_LOCATOR = 'SELECT format, cfi, page, progress FROM locator WHERE work_id = ?'

export const INSERT_BOOKMARK = `INSERT INTO bookmark (id, work_id, format, cfi, page, progress,
    label, created_at)
  VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`
export const LIST_BOOKMARKS = `SELECT id, work_id, label, created_at, format, cfi, page, progress
  FROM bookmark WHERE work_id = ? ORDER BY created_at, id`
export const REMOVE_BOOKMARK = 'DELETE FROM bookmark WHERE id = ? RETURNING id'

export const START_SESSION = `INSERT INTO reading_session (id, work_id, started_at, minutes,
    progress_start)
  VALUES (?1, ?2, ?3, 0, ?4)`
export const END_SESSION = `UPDATE reading_session SET ended_at = ?2, minutes = ?3, progress_end = ?4
  WHERE id = ?1 RETURNING id`

function text(value: unknown): string {
  return String(value)
}

function optionalText(value: unknown): string | undefined {
  return value === null || value === undefined ? undefined : String(value)
}

function optionalNumber(value: unknown): number | undefined {
  return value === null || value === undefined ? undefined : Number(value)
}

/** Ligne de `WORK_SELECT` → `Work` (sans `coverUrl`, résolue par l'hôte). */
export function workFromRow(row: Row): Work & { coverPath?: string } {
  return {
    id: text(row.id),
    title: text(row.title),
    authors: JSON.parse(text(row.authors)) as string[],
    kind: text(row.kind) as Work['kind'],
    language: optionalText(row.language),
    coverPath: optionalText(row.cover_url),
    seriesId: optionalText(row.series_id),
    volume: optionalNumber(row.volume),
    format: text(row.format) as Work['format'],
    sha256: text(row.sha256),
    sizeBytes: Number(row.size_bytes),
    pageCount: optionalNumber(row.page_count),
    addedAt: text(row.added_at),
    status: text(row.status) as Work['status'],
    progress: Number(row.progress),
    lastReadAt: optionalText(row.last_read_at),
  }
}

export function seriesFromRow(row: Row): Series {
  return {
    id: text(row.id),
    title: text(row.title),
    direction: text(row.direction) as Series['direction'],
  }
}

export function locatorFromRow(row: Row): Locator {
  return {
    format: text(row.format) as Locator['format'],
    cfi: optionalText(row.cfi),
    page: optionalNumber(row.page),
    progress: Number(row.progress),
  }
}

export function bookmarkFromRow(row: Row): Bookmark {
  return {
    id: text(row.id),
    workId: text(row.work_id),
    label: text(row.label),
    createdAt: text(row.created_at),
    locator: locatorFromRow(row),
  }
}

/** Valide une fraction de [0, 1] (progression), comme `check_fraction` côté Rust. */
export function checkFraction(what: string, value: number): void {
  if (!(value >= 0 && value <= 1)) throw new Error(`${what} hors de [0, 1] : ${value}`)
}
