/**
 * The one place that decides which speech-to-text provider handles a request.
 *
 * Lives outside services/subtitler and services/voice because both call it —
 * they used to carry two independent, silently diverging policies (the voice
 * router ignored TRANSCRIPTION_PROVIDER entirely).
 */

import { type Locale } from '../localization/types.js';

export type TranscriptionProvider = 'voxtral' | 'greenpt';
export type TranscriptionProviderOverride = TranscriptionProvider | 'auto';

/**
 * Transcription providers in preference order, best first.
 *
 * Callers walk the chain and skip providers whose API key is unset, so a
 * deployment missing one of them degrades instead of failing.
 *
 * Both deliver genuine per-word timestamps — Voxtral under `segments` with
 * exactly one word per entry (verified: 498 entries, median 1 word each),
 * GreenPT under `words`. The differing key names are a naming accident, not a
 * capability difference.
 *
 * Voxtral leads on quality: measured on three 90 s broadcast excerpts it reads
 * proper nouns GreenPT garbles ("Katja Hoyer" vs "Kathe Heuer", "Lothar de
 * Maizière" vs "Lota"), and it is the only one that takes a vocabulary hint.
 * GreenPT is 4–6× faster and runs on different infrastructure, which is what
 * makes it a real failover rather than a second instance of the same risk.
 *
 * There is no length rule any more. It existed for Regolo, whose own guidance
 * capped it at 2 minutes ("to prevent hallucinations and duplicate
 * transcriptions" — reproduced live on a 180 s excerpt, where it repeated a
 * whole sentence). Neither remaining provider carries that caveat: Voxtral was
 * verified over 45 minutes at 99.9 % coverage, GreenPT likewise.
 */
export const TRANSCRIPTION_CHAIN: readonly TranscriptionProvider[] = ['voxtral', 'greenpt'];

/**
 * Diarization is a hard requirement, not a preference: the voice layer keys
 * `identifySpeakers` off the `[speaker_N]` marker, so a provider that cannot
 * produce one must not appear in the chain at all — it would return a
 * perfectly valid transcript with every speaker silently merged.
 *
 * Currently every provider qualifies. The list is what made Regolo drop out of
 * diarized chains automatically when it was removed, and it is what a fourth
 * provider will be measured against.
 */
const DIARIZATION_CAPABLE: readonly TranscriptionProvider[] = ['voxtral', 'greenpt'];

/** `context_bias` is a Voxtral request parameter; nobody else accepts one. */
const CONTEXT_BIAS_CAPABLE: readonly TranscriptionProvider[] = ['voxtral'];

export interface ProviderChoiceInput {
  /** Speaker diarization — both providers can, so this only narrows the chain. */
  diarize?: boolean;
  /**
   * Vocabulary biasing the CALLER asked for (the voice API's contextBias
   * option) — a Voxtral-only parameter, so requesting it pins the request to
   * Voxtral and leaves no failover.
   *
   * The locale vocabulary from `buildContextBias` must NOT be passed here: it
   * is a default applied to every Voxtral request, so feeding it in would make
   * this gate fire on every single call.
   */
  requestedContextBias?: string[] | undefined;
  /** TRANSCRIPTION_PROVIDER; 'auto' (the default) means "apply the rules". */
  override?: TranscriptionProviderOverride;
}

export interface ProviderChoice {
  provider: TranscriptionProvider;
  /** Why this provider won — carried into the log line, not user-facing. */
  reason: 'override' | 'capability' | 'default';
  /**
   * Every provider to try, winner first. Callers walk it and skip the ones
   * whose API key is unset.
   */
  chain: readonly TranscriptionProvider[];
}

export function chooseProvider(input: ProviderChoiceInput = {}): ProviderChoice {
  const { diarize, requestedContextBias, override = 'auto' } = input;

  const needsDiarization = diarize === true;
  const needsContextBias = requestedContextBias !== undefined && requestedContextBias.length > 0;

  // Hard request requirements shrink the chain itself, not just its head: a
  // provider that cannot satisfy one would answer with a valid-looking
  // transcript that quietly lacks what was asked for. Failing over to one is
  // worse than failing.
  const eligible = TRANSCRIPTION_CHAIN.filter(
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

  // 2. Capability gate. Voxtral leads the eligible list, so a diarized request
  //    still lands there — GreenPT is a real failover behind it, not a silent
  //    downgrade.
  if (needsDiarization || needsContextBias) {
    return choose(eligible[0] ?? 'voxtral', 'capability');
  }

  // 3. Nothing to decide: quality wins.
  return choose('voxtral', 'default');
}

/**
 * Both locales transcribe as plain `de`.
 *
 * Measured 2026-07-29 against Regolo's faster-whisper, which validates the
 * code against Whisper's 100-entry ISO-639-1 set and answers `de-AT`, `at` and
 * `de_AT` with HTTP 422. Regolo is gone, but Voxtral has never been tested
 * with a regional code either, so the mapping stands until someone measures it.
 *
 * Kept as a named function so that a provider which does learn regional codes
 * is a one-line change rather than a hunt through the request builders.
 */
export function toTranscriptionLanguage(_locale: Locale): string {
  return 'de';
}
