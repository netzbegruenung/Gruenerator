/**
 * Audio MIME lookup shared by both provider request builders.
 *
 * The subtitler's Regolo call used to hardcode `audio/wav` while always
 * handing it an .mp3 — harmless in practice, but the two builders disagreeing
 * about the same upload is exactly the drift this folder exists to end.
 */

const MIME_BY_EXTENSION: Record<string, string> = {
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  m4a: 'audio/m4a',
  aac: 'audio/aac',
  ogg: 'audio/ogg',
  webm: 'audio/webm',
  flac: 'audio/flac',
};

export function mimeTypeFromFilename(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase();
  return MIME_BY_EXTENSION[ext ?? ''] ?? 'audio/wav';
}
