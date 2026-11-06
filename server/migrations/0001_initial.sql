CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  bundle_id TEXT,
  accent TEXT,
  retention_days INTEGER NOT NULL DEFAULT 30
    CHECK (retention_days BETWEEN 1 AND 365),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS api_keys (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('public', 'admin')),
  prefix TEXT NOT NULL,
  hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  revoked_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_api_keys_project ON api_keys (project_id, created_at DESC);

CREATE TABLE IF NOT EXISTS feedback (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
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
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'triaged', 'closed')),
  internal_note TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (project_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_feedback_project_created ON feedback (project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_feedback_project_status ON feedback (project_id, status);
CREATE INDEX IF NOT EXISTS idx_feedback_installation ON feedback (installation_hash, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_feedback_attachment_token ON feedback (attachment_token);

CREATE TABLE IF NOT EXISTS destinations (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('slack_webhook', 'webhook')),
  url TEXT NOT NULL,
  secret TEXT,
  categories_json TEXT NOT NULL DEFAULT '[]',
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_destinations_project ON destinations (project_id, created_at);

CREATE TABLE IF NOT EXISTS deliveries (
  id TEXT PRIMARY KEY,
  feedback_id TEXT NOT NULL REFERENCES feedback(id) ON DELETE CASCADE,
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

CREATE INDEX IF NOT EXISTS idx_deliveries_due ON deliveries (status, next_attempt_at);
CREATE INDEX IF NOT EXISTS idx_deliveries_feedback ON deliveries (feedback_id);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
