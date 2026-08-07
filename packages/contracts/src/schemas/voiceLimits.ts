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
 * MAX_AUDIO_MINUTES is no longer a hard rejection ceiling: audio longer than
 * this is auto-split server-side into ≤MAX_AUDIO_MINUTES chunks (one Voxtral
 * call per chunk, transcripts merged with offset timestamps) — see
 * transcribeBuffer() in apps/api/services/voice/transcriptionRouterService.ts.
 * The value itself still reflects Voxtral's documented per-call ceiling.
 *
 * MAX_VIDEO_UPLOAD_BYTES raises the raw-upload ceiling for the Transkription
 * feature's TUS path (/api/audio/upload) only — video is transcoded down to a
 * mono 16kHz mp3 before it ever reaches a provider, so the upload size and the
 * transcribed payload size are unrelated. The subtitler TUS path
 * (/api/subtitler/upload) and the legacy multer /transcribe route (short mic
 * clips via packages/voice) intentionally stay on MAX_AUDIO_BYTES.
 */
export const MAX_AUDIO_BYTES = 500 * 1024 * 1024;
export const MAX_VIDEO_UPLOAD_BYTES = 3 * 1024 * 1024 * 1024;
export const MAX_AUDIO_MINUTES = 120;

export const MAX_AUDIO_MB = MAX_AUDIO_BYTES / 1024 / 1024;
export const MAX_VIDEO_UPLOAD_MB = MAX_VIDEO_UPLOAD_BYTES / 1024 / 1024;

/** Human-readable forms, so the advertised limit cannot drift from the enforced one. */
export const MAX_FILE_SIZE_LABEL = `${MAX_AUDIO_MB}MB`;
export const MAX_DURATION_LABEL = `${MAX_AUDIO_MINUTES} Minuten`;
