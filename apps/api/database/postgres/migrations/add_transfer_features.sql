-- Transfer feature enhancements: expiry, password protection, multi-file support
ALTER TABLE shared_media ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
ALTER TABLE shared_media ADD COLUMN IF NOT EXISTS password_hash TEXT;
ALTER TABLE shared_media ADD COLUMN IF NOT EXISTS transfer_files JSONB DEFAULT '[]';
ALTER TABLE shared_media ADD COLUMN IF NOT EXISTS transfer_message TEXT;

CREATE INDEX IF NOT EXISTS idx_shared_media_expires
  ON shared_media(expires_at) WHERE media_type = 'transfer' AND expires_at IS NOT NULL;

-- Allow anonymous downloads (no email required for transfer downloads)
ALTER TABLE shared_media_downloads ALTER COLUMN downloader_email DROP NOT NULL;
