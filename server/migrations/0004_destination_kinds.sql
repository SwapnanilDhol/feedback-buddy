-- Destination kinds are validated in code; drop the CHECK so adding a kind
-- (email today) no longer needs a table rebuild. SQLite cannot alter a CHECK,
-- so the table is recreated. Deliveries are copied alongside because dropping
-- the referenced table would cascade-delete them.
PRAGMA defer_foreign_keys = true;

CREATE TABLE destinations_v2 (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  url TEXT NOT NULL,
  secret TEXT,
  categories_json TEXT NOT NULL DEFAULT '[]',
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
INSERT INTO destinations_v2 SELECT id, project_id, kind, url, secret, categories_json, enabled, created_at, updated_at FROM destinations;

CREATE TABLE deliveries_v2 (
  id TEXT PRIMARY KEY,
  feedback_id TEXT NOT NULL REFERENCES feedback(id) ON DELETE CASCADE,
  destination_id TEXT NOT NULL REFERENCES destinations_v2(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'delivered', 'failed', 'exhausted')),
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TEXT,
  last_error TEXT,
  delivered_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
INSERT INTO deliveries_v2 SELECT id, feedback_id, destination_id, status, attempts, next_attempt_at, last_error, delivered_at, created_at, updated_at FROM deliveries;

DROP TABLE deliveries;
DROP TABLE destinations;
ALTER TABLE destinations_v2 RENAME TO destinations;
ALTER TABLE deliveries_v2 RENAME TO deliveries;

CREATE INDEX IF NOT EXISTS idx_destinations_project ON destinations (project_id, created_at);
CREATE INDEX IF NOT EXISTS idx_deliveries_due ON deliveries (status, next_attempt_at);
CREATE INDEX IF NOT EXISTS idx_deliveries_feedback ON deliveries (feedback_id);
