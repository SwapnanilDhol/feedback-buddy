-- Operator passkeys (WebAuthn credentials) for dashboard sign-in.
CREATE TABLE IF NOT EXISTS passkeys (
  id TEXT PRIMARY KEY,                 -- credential ID, base64url
  name TEXT NOT NULL,
  public_key TEXT NOT NULL,            -- COSE public key, base64url
  counter INTEGER NOT NULL DEFAULT 0,
  transports_json TEXT NOT NULL DEFAULT '[]',
  device_type TEXT NOT NULL DEFAULT 'singleDevice'
    CHECK (device_type IN ('singleDevice', 'multiDevice')),
  backed_up INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  last_used_at TEXT
);
