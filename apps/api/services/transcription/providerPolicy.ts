/**
 * The one place that decides which speech-to-text provider handles a request.
 *
 * Lives outside services/subtitler and services/voice because both call it —
 * they used to carry two independent, silently diverging policies (the voice
 * router ignored TRANSCRIPTION_PROVIDER entirely).
 */

import { type Locale } from '../localization/types.js';

export type TranscriptionProvider = 'regolo' | 'voxtral' | 'greenpt';
export type TranscriptionProviderOverride = TranscriptionProvider | 'auto';

/**
 * Regolo's own guidance: "We recommend using audio chunks of less than 2
 * minutes to prevent hallucinations and duplicate transcriptions." Longer
 * audio goes to Voxtral, which has no such caveat.
 *
 * Reproduced live 2026-07-31 on a 180 s broadcast excerpt: Regolo repeated a
 * whole sentence twice at the end ("Jetzt gehört euch, … ihr wart ärmer, …"),
 * Voxtral did not. The threshold is not folklore.
 */
export const REGOLO_MAX_SECONDS = 120;

/**
 * Transcription providers in preference order, best first.
 *
 * Callers walk the chain and skip providers whose API key is unset, so a
 * deployment missing one of them degrades instead of failing.
 *
 * All three deliver genuine per-word timestamps — Regolo under `words`, Voxtral
 * under `segments` with exactly one word per entry (verified: 498 entries,
 * median 1 word each), GreenPT under `words`. The differing key names are a
 * naming accident, not a capability difference.
 *
 * Voxtral leads on quality (measured on three 90 s broadcast excerpts: it
 * reads proper nouns the other two garble) and is the only one that takes a
 * vocabulary hint. GreenPT sits ahead of Regolo because it is 4–6× faster and
 * carries no length caveat; Regolo stays last as the third opinion.
 */
export const WHISPER_CHAIN: readonly TranscriptionProvider[] = ['voxtral', 'greenpt', 'regolo'];

/**
 * Diarization is a hard requirement, not a preference: the voice layer keys
 * `identifySpeakers` off the `[speaker_N]` marker, so a provider that cannot
 * produce one must not appear in the chain at all — it would return a
 * perfectly valid transcript with every speaker silently merged.
 */
const DIARIZATION_CAPABLE: readonly TranscriptionProvider[] = ['voxtral', 'greenpt'];

/** `context_bias` is a Voxtral request parameter; nobody else accepts one. */
const CONTEXT_BIAS_CAPABLE: readonly TranscriptionProvider[] = ['voxtral'];

export interface ProviderChoiceInput {
  /** Audio length in seconds, or null when it could not be probed. */
  durationSeconds: number | null;
  /** Speaker diarization — Voxtral and GreenPT can, Regolo's Whisper cannot. */
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
  /**
   * Every provider to try, winner first. Callers walk it and skip the ones
   * whose API key is unset.
   */
  chain: readonly TranscriptionProvider[];
}

export function chooseProvider(input: ProviderChoiceInput): ProviderChoice {
  const { durationSeconds, diarize, requestedContextBias, override = 'auto' } = input;

  const needsDiarization = diarize === true;
  const needsContextBias = requestedContextBias !== undefined && requestedContextBias.length > 0;

  // Hard request requirements shrink the chain itself, not just its head: a
  // provider that cannot diarize would answer a diarized request with a valid
  // transcript in which every speaker is silently merged. Failing over to one
  // is worse than failing.
  const eligible = WHISPER_CHAIN.filter(
    (provider) =>
      (!needsDiarization || DIARIZATION_CAPABLE.includes(provider)) &&
      (!needsContextBias || CONTEXT_BIAS_CAPABLE.includes(provider))
  );

  const choose = (
    provider: TranscriptionProvider,
    reason: ProviderChoice['reason']
  ): ProviderChoice => ({
    provider,
    reason,
    chain: [provider, ...eligible.filter((p) => p !== provider)],
  });

  // 1. Explicit override wins — the emergency switch when a provider degrades.
  //    But only among the eligible: TRANSCRIPTION_PROVIDER is a deployment
  //    setting and cannot know that this particular request needs speaker ids.
  if (override !== 'auto' && eligible.includes(override)) {
    return choose(override, 'override');
  }

  // 2. Capability gate, BEFORE the duration rule. Voxtral leads the eligible
  //    list, so a diarized request still lands there — GreenPT is now a real
  //    failover behind it rather than a silent downgrade.
  if (needsDiarization || needsContextBias) {
    return choose(eligible[0] ?? 'voxtral', 'capability');
  }

  // 3. Unknown duration: assume it could be long. Voxtral has no length caveat,
  //    so this is the choice that cannot produce duplicate transcriptions.
  if (durationSeconds === null) {
    return choose('voxtral', 'unknown-duration');
  }

  // 4. The actual rule.
  return choose(durationSeconds < REGOLO_MAX_SECONDS ? 'regolo' : 'voxtral', 'duration');
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
