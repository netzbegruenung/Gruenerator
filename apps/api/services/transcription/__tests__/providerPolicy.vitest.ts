import { describe, expect, it } from 'vitest';

import {
  chooseProvider,
  REGOLO_MAX_SECONDS,
  supportsWordTimestamps,
  toWhisperLanguage,
} from '../providerPolicy.js';
import { buildContextBias, MAX_CONTEXT_BIAS_TERMS } from '../transcriptionBias.js';

describe('chooseProvider', () => {
  it('sends short audio to the Scaleway Whisper lane', () => {
    expect(chooseProvider({ durationSeconds: 30 })).toEqual({
      provider: 'scaleway',
      reason: 'duration',
      chain: ['scaleway', 'regolo', 'voxtral'],
    });
  });

  it('sends audio at or above the threshold to Voxtral', () => {
    // Regolo's own guidance is "less than 2 minutes", so the boundary itself
    // already belongs to Voxtral. Applied to Scaleway too: same
    // whisper-large-v3, so the caveat is the model's, not the host's.
    expect(chooseProvider({ durationSeconds: REGOLO_MAX_SECONDS - 1 }).provider).toBe('scaleway');
    expect(chooseProvider({ durationSeconds: REGOLO_MAX_SECONDS }).provider).toBe('voxtral');
    expect(chooseProvider({ durationSeconds: 3600 }).provider).toBe('voxtral');
  });

  it('assumes long audio when the duration is unknown', () => {
    expect(chooseProvider({ durationSeconds: null }).provider).toBe('voxtral');
    expect(chooseProvider({ durationSeconds: null }).reason).toBe('unknown-duration');
  });

  it('routes diarization to Voxtral regardless of length', () => {
    // Whisper returns no speaker ids; the voice layer keys identifySpeakers off
    // the `[speaker_` marker that only diarized Voxtral responses produce.
    expect(chooseProvider({ durationSeconds: 10, diarize: true }).provider).toBe('voxtral');
    expect(chooseProvider({ durationSeconds: 10, diarize: true }).reason).toBe('capability');
  });

  it('routes caller-requested context bias to Voxtral regardless of length', () => {
    expect(
      chooseProvider({ durationSeconds: 10, requestedContextBias: ['Gewessler'] }).provider
    ).toBe('voxtral');
    // An empty array is not a request.
    expect(chooseProvider({ durationSeconds: 10, requestedContextBias: [] }).provider).toBe(
      'scaleway'
    );
  });

  it('lets the env override beat every rule', () => {
    const pinned = chooseProvider({ durationSeconds: 3600, override: 'regolo' });
    expect(pinned.provider).toBe('regolo');
    expect(pinned.reason).toBe('override');
    expect(chooseProvider({ durationSeconds: 10, override: 'voxtral' }).provider).toBe('voxtral');
    expect(
      chooseProvider({ durationSeconds: 10, diarize: true, override: 'regolo' }).provider
    ).toBe('regolo');
  });

  it("treats 'auto' as no override", () => {
    expect(chooseProvider({ durationSeconds: 10, override: 'auto' }).reason).toBe('duration');
  });

  it('keeps the chosen provider at the head of its own fallback chain', () => {
    const choice = chooseProvider({ durationSeconds: 10, override: 'voxtral' });
    expect(choice.chain[0]).toBe('voxtral');
    expect(choice.chain).toContain('scaleway');
    expect(new Set(choice.chain).size).toBe(choice.chain.length);
  });
});

/**
 * The gate that keeps a SUCCESSFUL but unusable response from being accepted.
 *
 * Scaleway's whisper-large-v3 answers `timestamp_granularities[]=word` with
 * `words: null` (measured 2026-07-30). That is not an error, so a provider loop
 * would count it as success and never fail over — the subtitler would ship
 * word-mode subtitles with no word timings. Hence the exclusion happens when
 * the chain is built, not when a request fails.
 */
describe('chooseProvider — word timestamps', () => {
  it('never offers Scaleway when word timestamps are required', () => {
    for (const durationSeconds of [10, REGOLO_MAX_SECONDS, 3600, null]) {
      const choice = chooseProvider({ durationSeconds, needsWordTimestamps: true });
      expect(choice.chain).not.toContain('scaleway');
      expect(choice.provider).not.toBe('scaleway');
    }
  });

  it('prefers Regolo for short word-timestamped audio', () => {
    expect(chooseProvider({ durationSeconds: 30, needsWordTimestamps: true })).toEqual({
      provider: 'regolo',
      reason: 'duration',
      chain: ['regolo', 'voxtral'],
    });
  });

  it('drops an override that cannot deliver word timestamps', () => {
    // Pinning TRANSCRIPTION_PROVIDER=scaleway must not silently produce
    // wordless subtitles; the request falls through to a provider that can.
    const choice = chooseProvider({
      durationSeconds: 30,
      override: 'scaleway',
      needsWordTimestamps: true,
    });
    expect(choice.chain).toEqual(['regolo', 'voxtral']);
  });

  it('agrees with supportsWordTimestamps', () => {
    expect(supportsWordTimestamps('scaleway')).toBe(false);
    expect(supportsWordTimestamps('regolo')).toBe(true);
    expect(supportsWordTimestamps('voxtral')).toBe(true);
  });
});

describe('toWhisperLanguage', () => {
  it('maps both locales to the ISO-639-1 code', () => {
    // Measured against Regolo 2026-07-29: 'de-AT', 'at' and 'de_AT' all return
    // HTTP 422 listing the 100 accepted Whisper codes — 'de' is the only German.
    expect(toWhisperLanguage('de-DE')).toBe('de');
    expect(toWhisperLanguage('de-AT')).toBe('de');
  });
});

describe('buildContextBias', () => {
  it('returns country-specific vocabulary', () => {
    const at = buildContextBias('de-AT');
    const de = buildContextBias('de-DE');

    expect(at).toContain('Jänner');
    expect(at).toContain('Landeshauptmann');
    expect(at).toContain('Leonore Gewessler');
    expect(de).toContain('Bundestag');
    expect(de).toContain('Bündnis 90/Die Grünen');
  });

  it('keeps the two lists disjoint where it matters', () => {
    const at = new Set(buildContextBias('de-AT'));
    for (const germanOnly of ['Bundestag', 'Ministerpräsident', 'Bündnis 90/Die Grünen']) {
      expect(at.has(germanOnly)).toBe(false);
    }
  });

  it("stays within Mistral's context_bias limit", () => {
    for (const locale of ['de-DE', 'de-AT'] as const) {
      const terms = buildContextBias(locale);
      expect(terms.length).toBeGreaterThan(0);
      expect(terms.length).toBeLessThanOrEqual(MAX_CONTEXT_BIAS_TERMS);
    }
  });
});
