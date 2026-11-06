-- Jira/Linear-style workflow: statuses become todo | in_progress | done | wont_do
-- (validated in code, no CHECK), each project gets a short issue key (GOA) and
-- each feedback a per-project sequence number (GOA-12). SQLite cannot drop a
-- CHECK, so feedback is rebuilt; deliveries reference it and are rebuilt too.
PRAGMA defer_foreign_keys = true;

ALTER TABLE projects ADD COLUMN key TEXT;
UPDATE projects SET key = upper(substr(replace(replace(slug, '-', ''), '_', ''), 1, 3)) WHERE key IS NULL;

CREATE TABLE feedback_v2 (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  number INTEGER NOT NULL DEFAULT 0,
  idempotency_key TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('feedback', 'bug', 'idea')),
  message TEXT NOT NULL,
  name TEXT,
  reply_email TEXT,
  installation_hash TEXT NOT NULL,
  user_agent TEXT,
  app_version TEXT NOT NULL,
  build_number TEXT NOT NULL,
  os_version TEXT NOT NULL,
  locale TEXT NOT NULL,
  device_family TEXT NOT NULL,
  device_model TEXT,
  user_id TEXT,
  account_status TEXT NOT NULL DEFAULT 'unknown'
    CHECK (account_status IN ('unknown', 'free', 'paid')),
  plan TEXT,
  entitlements_json TEXT NOT NULL DEFAULT '[]',
  attributes_json TEXT NOT NULL DEFAULT '{}',
  attachment_key TEXT,
  attachment_content_type TEXT,
  attachment_byte_count INTEGER,
  attachment_token TEXT,
  status TEXT NOT NULL DEFAULT 'todo',
  internal_note TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (project_id, idempotency_key)
);

INSERT INTO feedback_v2 (
  id, project_id, number, idempotency_key, category, message, name, reply_email, installation_hash, user_agent,
  app_version, build_number, os_version, locale, device_family, device_model, user_id, account_status, plan,
  entitlements_json, attributes_json, attachment_key, attachment_content_type, attachment_byte_count, attachment_token,
  status, internal_note, created_at, updated_at
)
SELECT
  id, project_id,
  ROW_NUMBER() OVER (PARTITION BY project_id ORDER BY created_at, id),
  idempotency_key, category, message, name, reply_email, installation_hash, user_agent,
  app_version, build_number, os_version, locale, device_family, device_model, user_id, account_status, plan,
  entitlements_json, attributes_json, attachment_key, attachment_content_type, attachment_byte_count, attachment_token,
  CASE status WHEN 'new' THEN 'todo' WHEN 'triaged' THEN 'in_progress' WHEN 'closed' THEN 'done' ELSE status END,
  internal_note, created_at, updated_at
FROM feedback;

CREATE TABLE deliveries_v3 (
  id TEXT PRIMARY KEY,
  feedback_id TEXT NOT NULL REFERENCES feedback_v2(id) ON DELETE CASCADE,
  destination_id TEXT NOT NULL REFERENCES destinations(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'delivered', 'failed', 'exhausted')),
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TEXT,
  last_error TEXT,
  delivered_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
INSERT INTO deliveries_v3 SELECT id, feedback_id, destination_id, status, attempts, next_attempt_at, last_error, delivered_at, created_at, updated_at FROM deliveries;

DROP TABLE deliveries;
DROP TABLE feedback;
ALTER TABLE feedback_v2 RENAME TO feedback;
ALTER TABLE deliveries_v3 RENAME TO deliveries;

CREATE INDEX IF NOT EXISTS idx_feedback_project_created ON feedback (project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_feedback_project_status ON feedback (project_id, status);
CREATE INDEX IF NOT EXISTS idx_feedback_installation ON feedback (installation_hash, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_feedback_attachment_token ON feedback (attachment_token);
CREATE UNIQUE INDEX IF NOT EXISTS idx_feedback_project_number ON feedback (project_id, number);
CREATE INDEX IF NOT EXISTS idx_deliveries_due ON deliveries (status, next_attempt_at);
CREATE INDEX IF NOT EXISTS idx_deliveries_feedback ON deliveries (feedback_id);
