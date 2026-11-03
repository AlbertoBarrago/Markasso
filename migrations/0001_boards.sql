CREATE TABLE boards (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL,
  size INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  last_written_at TEXT NOT NULL,
  scene_key TEXT NOT NULL UNIQUE
);
CREATE INDEX boards_last_written_at ON boards(last_written_at);
