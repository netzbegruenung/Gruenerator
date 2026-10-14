/**
 * User-facing failure messages for the Transkription routes.
 *
 * The routes used to forward the raw error text — an ffmpeg exit line or a
 * provider's HTTP body — which tells the person nothing about what to do next.
 * The raw error still goes to the log; this is what the person reads.
 */

export type TranscriptionPhase = 'read' | 'extraction' | 'transcription';

// ffmpeg's wording when the input has no audio track to map.
const NO_AUDIO_STREAM_RE = /does not contain any stream|matches no streams|no audio/i;

export function describeTranscriptionFailure(phase: TranscriptionPhase, error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);

  if (phase === 'read') {
    return 'Die hochgeladene Datei konnte nicht gelesen werden. Bitte lade sie erneut hoch.';
  }
  if (phase === 'extraction') {
    if (NO_AUDIO_STREAM_RE.test(message)) {
      return 'Das Video enthält keine Tonspur, deshalb gibt es nichts zu transkribieren.';
    }
    return 'Die Tonspur konnte nicht aus dem Video gelesen werden. Die Datei ist möglicherweise beschädigt oder in einem Format, das wir nicht verarbeiten können. Versuche es mit einer MP4- oder MP3-Datei.';
  }
  return 'Der Transkriptionsdienst konnte die Aufnahme gerade nicht verarbeiten. Bitte versuche es in ein paar Minuten erneut. Bleibt der Fehler, ist die Audiodatei möglicherweise beschädigt.';
}

export function audioTooLargeMessage(maxMb: number): string {
  return `Audiodateien dürfen höchstens ${maxMb} MB groß sein. Wandle die Aufnahme vorher in MP3 oder M4A um, dann wird sie deutlich kleiner. Videos dürfen größer sein.`;
}
