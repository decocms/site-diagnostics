-- Replace the plaintext `creds TEXT` column with AES-256-GCM ciphertext.
-- Any pre-existing rows would be unencrypted secrets at rest — dropping
-- them is intentional. After this migration all credentials must be
-- written through saveOrgCredentials (src/auth/credentials.ts), which
-- encrypts under CREDS_ENCRYPTION_KEY.
--
-- Mapping tables reference org_credentials(org_id); FK enforcement is off
-- by default in SQLite/D1, so dropping the referenced table leaves them
-- pointing at org_ids with no creds row, which the app already treats as
-- "no proprietary sources".

DROP TABLE IF EXISTS org_credentials;

CREATE TABLE org_credentials (
  org_id       TEXT PRIMARY KEY,
  creds_cipher BLOB NOT NULL,
  creds_iv     BLOB NOT NULL,
  key_version  INTEGER NOT NULL DEFAULT 1
);
