-- Voice for speech output, chosen in the settings. NULL means the default
-- voice (DEFAULT_TTS_VOICE_ID in @gruenerator/contracts). No CHECK: the set of
-- offered voices is the contract's z.enum and grows with the provider's
-- catalogue; a voice retired there is remapped in code, not by a failing insert.
-- Targets the profiles table, which is created by schema.sql, so ordering
-- against other migrations is irrelevant.

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS tts_voice_id TEXT;
