import { describe, expect, it } from 'vitest';

import {
  acceptsOffer,
  offerKindForRecipes,
  offerNote,
  offerToRecord,
  offerTopic,
  parseRecordedOffer,
} from './artifactOffer.js';

describe('offerKindForRecipes', () => {
  it.each([
    [['instagram'], 'sharepic'],
    [['insta-hessen'], 'sharepic'],
    [['sprechzettel'], 'presentation'],
    [['presse'], 'document'],
    [['antrag'], 'document'],
  ])('%j → %s', (mentions, kind) => {
    expect(offerKindForRecipes(mentions)).toBe(kind);
  });

  it.each([[['reel']], [['reisekosten-nrw']], [['beschlusslage']], [[]], [['unbekannt']]])(
    '%j → no offer',
    (mentions) => {
      expect(offerKindForRecipes(mentions)).toBeNull();
    }
  );

  it('offers once even when two recipes are loaded', () => {
    expect(offerKindForRecipes(['beschlusslage', 'instagram', 'presse'])).toBe('sharepic');
  });
});

describe('offerNote', () => {
  it('names the artifact in a single closing question', () => {
    const note = offerNote(['sprechzettel']);
    expect(note).toContain('ABSCHLUSS');
    expect(note).toContain('Präsentation');
  });

  it('is empty without a fitting recipe', () => {
    expect(offerNote(['beschlusslage'])).toBe('');
  });
});

describe('offerToRecord', () => {
  const post = 'Klimaticket jetzt! 🚆 #Verkehrswende';

  it('records the offer the answer actually made', () => {
    expect(
      offerToRecord({
        recipeMentions: ['instagram'],
        text: `${post}\n\nSoll ich daraus ein Sharepic machen?`,
        producedArtifact: false,
      })
    ).toEqual({ kind: 'sharepic' });
  });

  it('records nothing when the model asked something else', () => {
    expect(
      offerToRecord({
        recipeMentions: ['instagram'],
        text: `${post}\n\nSoll ich den Post noch kürzen?`,
        producedArtifact: false,
      })
    ).toBeNull();
  });

  it('records nothing when the turn already built an artifact', () => {
    expect(
      offerToRecord({
        recipeMentions: ['instagram'],
        text: `${post}\n\nSoll ich daraus ein Sharepic machen?`,
        producedArtifact: true,
      })
    ).toBeNull();
  });

  it('records nothing without a recipe', () => {
    expect(
      offerToRecord({
        recipeMentions: [],
        text: 'Soll ich daraus ein Sharepic machen?',
        producedArtifact: false,
      })
    ).toBeNull();
  });
});

describe('parseRecordedOffer', () => {
  it('reads known kinds only', () => {
    expect(parseRecordedOffer({ kind: 'presentation' })).toBe('presentation');
    expect(parseRecordedOffer({ kind: 'vorlagen-galerie' })).toBeNull();
    expect(parseRecordedOffer(null)).toBeNull();
    expect(parseRecordedOffer('presentation')).toBeNull();
  });
});

describe('acceptsOffer', () => {
  it.each([
    'ja',
    'Ja gern!',
    'ja bitte',
    'gerne',
    'ok, mach das',
    'ja mach mal',
    'klar',
    'Ja, gerne doch.',
  ])('accepts %j', (text) => {
    expect(acceptsOffer(text)).toBe(true);
  });

  it.each([
    'nein danke',
    'ja, aber kürzer',
    'super, danke',
    'danke',
    'mach eine Präsentation über Radwege',
    'was kostet das Klimaticket?',
    '',
  ])('rejects %j', (text) => {
    expect(acceptsOffer(text)).toBe(false);
  });
});

describe('offerTopic', () => {
  it('drops the closing question', () => {
    expect(
      offerTopic(
        'Liebe Freund*innen, die Verkehrswende …\n\nSoll ich daraus eine Präsentation machen?'
      )
    ).toBe('Liebe Freund*innen, die Verkehrswende …');
  });
});
