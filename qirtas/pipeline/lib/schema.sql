-- Qirtas database schema (SQLite, built into Node — no external service)
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS books (
  id             TEXT PRIMARY KEY,
  slug           TEXT NOT NULL,
  title          TEXT NOT NULL,
  title_en       TEXT,
  author         TEXT,
  author_en      TEXT,
  translator     TEXT,
  publisher      TEXT,
  year           TEXT,
  era            TEXT,
  category       TEXT,
  language       TEXT NOT NULL DEFAULT 'ar',
  source_key     TEXT NOT NULL,
  source_label   TEXT,
  source_url     TEXT,
  license_type   TEXT,
  license_label  TEXT,
  license_url    TEXT,
  license_audit  TEXT,
  cover          TEXT,
  emoji          TEXT,
  file_path      TEXT,
  file_format    TEXT,
  file_bytes     INTEGER,
  words          INTEGER DEFAULT 0,
  chapters       INTEGER DEFAULT 0,
  description    TEXT,
  description_en TEXT,
  gutenberg_id   TEXT,
  death_year     INTEGER,
  search_key     TEXT,
  hidden         INTEGER NOT NULL DEFAULT 0,
  removed        INTEGER NOT NULL DEFAULT 0,
  removed_reason TEXT,
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_books_lang   ON books(language);
CREATE INDEX IF NOT EXISTS idx_books_cat    ON books(category);
CREATE INDEX IF NOT EXISTS idx_books_src    ON books(source_key);
CREATE INDEX IF NOT EXISTS idx_books_era    ON books(era);
CREATE INDEX IF NOT EXISTS idx_books_author ON books(author);
CREATE INDEX IF NOT EXISTS idx_books_search ON books(search_key);
CREATE INDEX IF NOT EXISTS idx_books_flags  ON books(hidden, removed);

CREATE TABLE IF NOT EXISTS takedown_requests (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  book_id       TEXT,
  book_title    TEXT,
  requester     TEXT NOT NULL,
  role          TEXT,
  email         TEXT,
  claim_type    TEXT,
  official_url  TEXT,
  message       TEXT,
  status        TEXT NOT NULL DEFAULT 'pending',
  decision_note TEXT,
  reviewer      TEXT,
  ip            TEXT,
  created_at    TEXT NOT NULL,
  reviewed_at   TEXT
);
CREATE INDEX IF NOT EXISTS idx_req_status ON takedown_requests(status);

CREATE TABLE IF NOT EXISTS import_runs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  source_key  TEXT NOT NULL,
  started_at  TEXT NOT NULL,
  finished_at TEXT,
  added       INTEGER DEFAULT 0,
  skipped     INTEGER DEFAULT 0,
  failed      INTEGER DEFAULT 0,
  notes       TEXT,
  log_path    TEXT
);

CREATE TABLE IF NOT EXISTS audit_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  actor       TEXT NOT NULL,
  action      TEXT NOT NULL,
  target_type TEXT,
  target_id   TEXT,
  details     TEXT,
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at);
