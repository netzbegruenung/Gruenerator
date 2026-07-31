import { describe, expect, it } from 'vitest';

import { chooseProvider, toTranscriptionLanguage } from '../providerPolicy.js';
import { buildContextBias, MAX_CONTEXT_BIAS_TERMS } from '../transcriptionBias.js';

describe('chooseProvider', () => {
  it('defaults to Voxtral, with GreenPT behind it', () => {
    expect(chooseProvider()).toEqual({
      provider: 'voxtral',
      reason: 'default',
      chain: ['voxtral', 'greenpt'],
    });
  });

  it('keeps both providers in a diarized chain, since both can diarize', () => {
    const choice = chooseProvider({ diarize: true });
    expect(choice.provider).toBe('voxtral');
    expect(choice.reason).toBe('capability');
    expect(choice.chain).toEqual(['voxtral', 'greenpt']);
  });

  it('leaves no failover for context bias, which only Voxtral accepts', () => {
    // The capability filter shrinks the chain itself. A provider that ignores
    // context_bias would answer with a valid transcript that quietly lacks the
    // requested vocabulary — worse than failing.
    const choice = chooseProvider({ requestedContextBias: ['Gewessler'] });
    expect(choice.provider).toBe('voxtral');
    expect(choice.chain).toEqual(['voxtral']);
  });

  it('treats an empty context-bias array as no request', () => {
    expect(chooseProvider({ requestedContextBias: [] }).chain).toEqual(['voxtral', 'greenpt']);
  });

  it('lets the env override pick the provider', () => {
    const pinned = chooseProvider({ override: 'greenpt' });
    expect(pinned.provider).toBe('greenpt');
    expect(pinned.reason).toBe('override');
    expect(pinned.chain).toEqual(['greenpt', 'voxtral']);
  });

  it('does not let the override defeat a hard capability requirement', () => {
    // TRANSCRIPTION_PROVIDER is a deployment setting; it cannot know that this
    // particular request asked for a vocabulary hint. The request wins.
    const choice = chooseProvider({ requestedContextBias: ['Gewessler'], override: 'greenpt' });
    expect(choice.provider).toBe('voxtral');
    expect(choice.reason).toBe('capability');
  });

  it('honours an override that does satisfy the requirement', () => {
    const choice = chooseProvider({ diarize: true, override: 'greenpt' });
    expect(choice.provider).toBe('greenpt');
    expect(choice.reason).toBe('override');
  });

  it("treats 'auto' as no override", () => {
    expect(chooseProvider({ override: 'auto' }).reason).toBe('default');
  });

  it('keeps the chosen provider at the head of its own fallback chain', () => {
    const choice = chooseProvider({ override: 'voxtral' });
    expect(choice.chain[0]).toBe('voxtral');
    expect(choice.chain).toContain('greenpt');
    expect(new Set(choice.chain).size).toBe(choice.chain.length);
  });
});

describe('toTranscriptionLanguage', () => {
  it('maps both locales to the ISO-639-1 code', () => {
    // Measured against Regolo 2026-07-29: 'de-AT', 'at' and 'de_AT' all return
    // HTTP 422 listing the 100 accepted Whisper codes — 'de' is the only German.
    expect(toTranscriptionLanguage('de-DE')).toBe('de');
    expect(toTranscriptionLanguage('de-AT')).toBe('de');
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
