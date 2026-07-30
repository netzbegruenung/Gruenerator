/**
 * The one place that decides which speech-to-text provider handles a request.
 *
 * Lives outside services/subtitler and services/voice because both call it —
 * they used to carry two independent, silently diverging policies (the voice
 * router ignored TRANSCRIPTION_PROVIDER entirely).
 */

import { type Locale } from '../localization/types.js';

export type TranscriptionProvider = 'regolo' | 'voxtral' | 'scaleway';
export type TranscriptionProviderOverride = TranscriptionProvider | 'auto';

/**
 * Regolo's own guidance: "We recommend using audio chunks of less than 2
 * minutes to prevent hallucinations and duplicate transcriptions." Longer
 * audio goes to Voxtral, which has no such caveat.
 *
 * Applied to Scaleway's Whisper too: both serve whisper-large-v3, so the caveat
 * is a property of the model rather than of Regolo's deployment.
 */
export const REGOLO_MAX_SECONDS = 120;

/**
 * Whisper providers in preference order, best first.
 *
 * Scaleway leads — same whisper-large-v3, and it is where the Mistral traffic
 * already runs. Regolo stays ahead of Voxtral so a Whisper request tries the
 * second Whisper implementation before falling back to a different model.
 *
 * Callers walk the chain and skip providers whose key is unset, so a deployment
 * without SCALEWAY_API_KEY behaves exactly as it did before.
 */
export const WHISPER_CHAIN: readonly TranscriptionProvider[] = ['scaleway', 'regolo', 'voxtral'];

/**
 * The chain for callers that need per-word timestamps — Scaleway removed.
 *
 * Measured 2026-07-30: Scaleway's whisper-large-v3 returns `words: null` even
 * when asked for `timestamp_granularities[]=word`, producing segments only.
 * Regolo returns real per-word `start`/`end`/`probability`.
 *
 * This exclusion is why the capability gate exists instead of one flat chain. A
 * wordless response is not an ERROR, so a provider loop counts it as success
 * and never falls through: the subtitler would silently ship word-mode
 * subtitles with no word timings rather than failing over to a provider that
 * has them.
 */
export const WORD_TIMESTAMP_CHAIN: readonly TranscriptionProvider[] = ['regolo', 'voxtral'];

/** Whether a provider returns per-word timestamps. See WORD_TIMESTAMP_CHAIN. */
export function supportsWordTimestamps(provider: TranscriptionProvider): boolean {
  return provider !== 'scaleway';
}

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
  /**
   * The caller needs per-word timestamps (the subtitler does; the voice routes
   * do not). Excludes Scaleway, which only returns segments — see
   * WORD_TIMESTAMP_CHAIN for why that has to be decided here and cannot be left
   * to the fallback loop.
   */
  needsWordTimestamps?: boolean;
}

export interface ProviderChoice {
  provider: TranscriptionProvider;
  /** Why this provider won — carried into the log line, not user-facing. */
  reason: 'override' | 'capability' | 'unknown-duration' | 'duration';
  /**
   * Every provider to try, winner first. Callers walk it and skip the ones
   * whose API key is unset; a provider that is unfit for the request (Scaleway
   * when word timestamps are required) never appears at all.
   */
  chain: readonly TranscriptionProvider[];
}

/** Winner first, then the remaining fit providers as failover. */
function withFailover(
  winner: TranscriptionProvider,
  needsWordTimestamps: boolean
): readonly TranscriptionProvider[] {
  const fit = (needsWordTimestamps ? WORD_TIMESTAMP_CHAIN : WHISPER_CHAIN).filter(
    (p) => p !== winner
  );
  // An override naming a provider that cannot do the job is honoured as far as
  // it can be — dropped from the chain rather than allowed to return a
  // response the caller cannot use.
  const winnerIsFit = !needsWordTimestamps || supportsWordTimestamps(winner);
  return winnerIsFit ? [winner, ...fit] : fit;
}

export function chooseProvider(input: ProviderChoiceInput): ProviderChoice {
  const {
    durationSeconds,
    diarize,
    requestedContextBias,
    override = 'auto',
    needsWordTimestamps = false,
  } = input;

  const choose = (
    provider: TranscriptionProvider,
    reason: ProviderChoice['reason']
  ): ProviderChoice => ({
    provider,
    reason,
    chain: withFailover(provider, needsWordTimestamps),
  });

  // 1. Explicit override wins — the emergency switch when a provider degrades.
  if (override !== 'auto') {
    return choose(override, 'override');
  }

  // 2. Capability gate, BEFORE the duration rule. Whisper returns no speaker
  //    ids, and the voice layer keys `identifySpeakers` off the `[speaker_`
  //    marker that only diarized Voxtral responses produce — routing a
  //    diarized request to Regolo would break it silently. context_bias is
  //    likewise a Voxtral-only parameter.
  if (diarize === true || (requestedContextBias !== undefined && requestedContextBias.length > 0)) {
    return choose('voxtral', 'capability');
  }

  // 3. Unknown duration: assume it could be long. Voxtral has no length caveat,
  //    so this is the choice that cannot produce duplicate transcriptions.
  if (durationSeconds === null) {
    return choose('voxtral', 'unknown-duration');
  }

  // 4. The actual rule. The Whisper side of it is Scaleway when the caller can
  //    use segment timestamps, Regolo when it needs word-level ones.
  if (durationSeconds >= REGOLO_MAX_SECONDS) {
    return choose('voxtral', 'duration');
  }
  return choose(needsWordTimestamps ? 'regolo' : 'scaleway', 'duration');
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
