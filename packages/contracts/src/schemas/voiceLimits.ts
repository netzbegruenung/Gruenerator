/**
 * Transcription input limits, in one place.
 *
 * These used to be two unrelated numbers: the upload path allowed 500 MB
 * (UploadZone, multer and the TUS store all independently), while
 * GET /api/voice/formats advertised "50MB (audio), ~30 minutes" — a figure
 * nothing enforced and nothing produced. A file over the real limit therefore
 * uploaded in full, got its audio extracted, and only then died inside the
 * provider SDK with a raw English error.
 *
 * The values below are Voxtral's documented ceiling, which is also the
 * effective one: Regolo faster-whisper runs first on the non-diarized path but
 * falls back to Voxtral when it refuses a file.
 */
export const MAX_AUDIO_BYTES = 500 * 1024 * 1024;
export const MAX_AUDIO_MINUTES = 60;

export const MAX_AUDIO_MB = MAX_AUDIO_BYTES / 1024 / 1024;

/** Human-readable forms, so the advertised limit cannot drift from the enforced one. */
export const MAX_FILE_SIZE_LABEL = `${MAX_AUDIO_MB}MB`;
export const MAX_DURATION_LABEL = `${MAX_AUDIO_MINUTES} Minuten`;
