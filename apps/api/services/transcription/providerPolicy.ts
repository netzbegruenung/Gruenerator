/**
 * The one place that decides which speech-to-text provider handles a request.
 *
 * Lives outside services/subtitler and services/voice because both call it —
 * they used to carry two independent, silently diverging policies (the voice
 * router ignored TRANSCRIPTION_PROVIDER entirely).
 */

import { type Locale } from '../localization/types.js';

export type TranscriptionProvider = 'regolo' | 'voxtral';
export type TranscriptionProviderOverride = TranscriptionProvider | 'auto';

/**
 * Regolo's own guidance: "We recommend using audio chunks of less than 2
 * minutes to prevent hallucinations and duplicate transcriptions." Longer
 * audio goes to Voxtral, which has no such caveat.
 */
export const REGOLO_MAX_SECONDS = 120;

export interface ProviderChoiceInput {
  /** Audio length in seconds, or null when it could not be probed. */
  durationSeconds: number | null;
  /** Speaker diarization — Whisper cannot do it at all. */
  diarize?: boolean;
  /**
   * Vocabulary biasing the CALLER asked for (the voice API's contextBias
   * option) — a Voxtral-only parameter, so requesting it forces Voxtral.
   *
   * The locale vocabulary from `buildContextBias` must NOT be passed here: it
   * is a default applied to every Voxtral request, so feeding it in would make
   * this gate fire every time and quietly retire the duration rule below.
   */
  requestedContextBias?: string[] | undefined;
  /** TRANSCRIPTION_PROVIDER; 'auto' (the default) means "apply the rules". */
  override?: TranscriptionProviderOverride;
}

export interface ProviderChoice {
  provider: TranscriptionProvider;
  /** Why this provider won — carried into the log line, not user-facing. */
  reason: 'override' | 'capability' | 'unknown-duration' | 'duration';
}

export function chooseProvider(input: ProviderChoiceInput): ProviderChoice {
  const { durationSeconds, diarize, requestedContextBias, override = 'auto' } = input;

  // 1. Explicit override wins — the emergency switch when a provider degrades.
  if (override !== 'auto') {
    return { provider: override, reason: 'override' };
  }

  // 2. Capability gate, BEFORE the duration rule. Whisper returns no speaker
  //    ids, and the voice layer keys `identifySpeakers` off the `[speaker_`
  //    marker that only diarized Voxtral responses produce — routing a
  //    diarized request to Regolo would break it silently. context_bias is
  //    likewise a Voxtral-only parameter.
  if (diarize === true || (requestedContextBias !== undefined && requestedContextBias.length > 0)) {
    return { provider: 'voxtral', reason: 'capability' };
  }

  // 3. Unknown duration: assume it could be long. Voxtral has no length caveat,
  //    so this is the choice that cannot produce duplicate transcriptions.
  if (durationSeconds === null) {
    return { provider: 'voxtral', reason: 'unknown-duration' };
  }

  // 4. The actual rule.
  return {
    provider: durationSeconds < REGOLO_MAX_SECONDS ? 'regolo' : 'voxtral',
    reason: 'duration',
  };
}

/**
 * Regolo's faster-whisper endpoint validates `language` against Whisper's
 * 100-code set (ISO-639-1). Measured 2026-07-29: `de-AT`, `at` and `de_AT` all
 * return HTTP 422 with an enum error listing the accepted codes, so an
 * Austrian variant cannot be expressed here — both locales map to `de`.
 *
 * Kept as a named function so that a provider that does learn regional codes
 * is a one-line change rather than a hunt through the request builders.
 */
export function toWhisperLanguage(_locale: Locale): string {
  return 'de';
}
