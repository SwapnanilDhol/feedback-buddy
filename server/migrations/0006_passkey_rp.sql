-- Passkeys are bound to the host they were created on; record it so each
-- dashboard host only offers (and accepts) its own credentials.
ALTER TABLE passkeys ADD COLUMN rp_id TEXT;
UPDATE passkeys SET rp_id = 'feedback-buddy.swapnanildhol.workers.dev' WHERE rp_id IS NULL;
