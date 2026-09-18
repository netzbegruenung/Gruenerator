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
 * feature's TUS path (/api/audio/upload), and only for uploads that declare a
 * video/* filetype (enforced in tusService's maxSize) — video is transcoded
 * down to a mono 16kHz mp3 before it ever reaches a provider, so the upload
 * size and the transcribed payload size are unrelated. Audio uploads ARE the
 * transcribed payload and stay on MAX_AUDIO_BYTES, as do the subtitler TUS
 * path (/api/subtitler/upload) and the legacy multer /transcribe route (short
 * mic clips via packages/voice).
 */
export const MAX_AUDIO_BYTES = 500 * 1024 * 1024;
export const MAX_VIDEO_UPLOAD_BYTES = 3 * 1024 * 1024 * 1024;
export const MAX_AUDIO_MINUTES = 120;

export const MAX_AUDIO_MB = MAX_AUDIO_BYTES / 1024 / 1024;
export const MAX_VIDEO_UPLOAD_MB = MAX_VIDEO_UPLOAD_BYTES / 1024 / 1024;

/** Human-readable forms, so the advertised limit cannot drift from the enforced one. */
export const MAX_FILE_SIZE_LABEL = `${MAX_AUDIO_MB}MB`;
export const MAX_DURATION_LABEL = `${MAX_AUDIO_MINUTES} Minuten`;

/**
 * Grünerator Voice (text → audio file).
 *
 * SPEECH_MAX_CHUNK_CHARS is what one provider request may carry — the same
 * cap the read-aloud controller enforces. KugelAudio itself accepts 10 000
 * (docs, 2026-09-15), so the number is ours, not theirs. Longer texts are split
 * on sentence boundaries server-side and the audio is joined; the total is
 * capped so one synchronous request stays inside the HTTP budget.
 */
export const SPEECH_MAX_CHUNK_CHARS = 8192;
export const SPEECH_MAX_TEXT_CHARS = 3 * SPEECH_MAX_CHUNK_CHARS;
/** Provider range for pitch-preserving time stretching; outside it the API answers 400. */
export const SPEECH_MIN_SPEED = 0.8;
export const SPEECH_MAX_SPEED = 1.2;
