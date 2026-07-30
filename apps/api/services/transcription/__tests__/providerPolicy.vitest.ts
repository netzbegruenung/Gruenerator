import { describe, expect, it } from 'vitest';

import { chooseProvider, REGOLO_MAX_SECONDS, toWhisperLanguage } from '../providerPolicy.js';
import { buildContextBias, MAX_CONTEXT_BIAS_TERMS } from '../transcriptionBias.js';

describe('chooseProvider', () => {
  it('sends short audio to Regolo', () => {
    expect(chooseProvider({ durationSeconds: 30 })).toEqual({
      provider: 'regolo',
      reason: 'duration',
      chain: ['regolo', 'voxtral'],
    });
  });

  it('sends audio at or above the threshold to Voxtral', () => {
    // Regolo's own guidance is "less than 2 minutes", so the boundary itself
    // already belongs to Voxtral — reproduced live on a 180 s excerpt, where
    // Regolo repeated a whole sentence and Voxtral did not.
    expect(chooseProvider({ durationSeconds: REGOLO_MAX_SECONDS - 1 }).provider).toBe('regolo');
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
      'regolo'
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
    expect(choice.chain).toContain('regolo');
    expect(new Set(choice.chain).size).toBe(choice.chain.length);
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
  // Entries are single words since the HTTP 400 fix — Mistral rejects anything
  // containing whitespace, a comma or a slash. Multi-word names therefore
  // appear as their parts; see contextBiasNormalization.vitest.ts.
  it('returns country-specific vocabulary', () => {
    const at = buildContextBias('de-AT');
    const de = buildContextBias('de-DE');

    expect(at).toContain('Jänner');
    expect(at).toContain('Landeshauptmann');
    expect(at).toContain('Gewessler');
    expect(de).toContain('Bundestag');
    expect(de).toContain('Bürgergeld');
  });

  it('keeps the two lists disjoint where it matters', () => {
    // Only on DISTINCTIVE terms. Splitting made generic parts ('Die', 'Grünen')
    // common to both lists, which says nothing about locale separation — the
    // German-only institutions do.
    const at = new Set(buildContextBias('de-AT'));
    for (const germanOnly of [
      'Bundestag',
      'Ministerpräsident',
      'Bürgergeld',
      'Deutschlandticket',
    ]) {
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
