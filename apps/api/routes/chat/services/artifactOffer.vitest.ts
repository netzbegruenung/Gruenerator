import { describe, expect, it, vi } from 'vitest';

const vorlagenCatalog = vi.hoisted(() => ({ size: 0 }));
vi.mock('../../../services/sharepicVorlagen/catalog.js', () => ({
  listSharepicVorlagen: () =>
    Array.from({ length: vorlagenCatalog.size }, (_, i) => ({ id: `v${i}` })),
}));

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
  const state = (over: Record<string, unknown> = {}) =>
    ({ userLocale: 'de-DE', vorlagenShown: [], enabledTools: {}, ...over }) as never;

  it('names the artifact in a single closing question', () => {
    const note = offerNote(state(), ['sprechzettel']);
    expect(note).toContain('ABSCHLUSS');
    expect(note).toContain('Präsentation');
  });

  it('is empty without a fitting recipe', () => {
    expect(offerNote(state(), ['beschlusslage'])).toBe('');
  });

  it('lets the Vorlagen gallery win after a social post', () => {
    vorlagenCatalog.size = 3;
    const note = offerNote(state(), ['instagram']);
    expect(note).toContain('Sharepic-Vorlagen');
    expect(note).not.toContain('Soll ich daraus ein Sharepic machen?');
  });

  it('falls back to the Sharepic offer without a Vorlagen catalog', () => {
    vorlagenCatalog.size = 0;
    expect(offerNote(state(), ['instagram'])).toContain('Soll ich daraus ein Sharepic machen?');
  });

  it('offers no Sharepic once the gallery was shown this turn', () => {
    vorlagenCatalog.size = 3;
    expect(offerNote(state({ vorlagenShown: ['Zitat'] }), ['instagram'])).toBe('');
  });

  it('respects a disabled tool', () => {
    expect(
      offerNote(state({ enabledTools: { create_presentation: false } }), ['sprechzettel'])
    ).toBe('');
  });

  it.each(['constructor', 'toString', '__proto__', 'hasOwnProperty'])(
    'survives a learned recipe named „%s"',
    (mention) => {
      expect(offerKindForRecipes([mention])).toBeNull();
      expect(offerNote(state(), [mention])).toBe('');
    }
  );
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

  it('records nothing for the Vorlagen question — the gallery has its own accept', () => {
    expect(
      offerToRecord({
        recipeMentions: ['instagram'],
        text: `${post}\n\nSoll ich dir passende Sharepic-Vorlagen zeigen?`,
        producedArtifact: false,
      })
    ).toBeNull();
  });

  // Bis 15.10.2026 hiess es hier „records nothing without a recipe". Die
  // Prompt-Regeln lassen das Modell aber auch ohne Rezept anbieten, und das „ja"
  // darauf lief ins Leere. Gespeichert wird jetzt, was das Angebot als
  // ERSTELLUNG formuliert — dasselbe Prädikat wie für einen Auftrag.
  it('records an offer to create, even without a recipe', () => {
    expect(
      offerToRecord({
        recipeMentions: [],
        text: 'Soll ich daraus ein Sharepic machen?',
        producedArtifact: false,
      })
    ).toEqual({ kind: 'sharepic' });
  });

  it('records the live offer that ended with „!" instead of a question', () => {
    const text =
      'Kachel 1: Stoppt die kommunale Unterfinanzierung!\n\n' +
      'Da du nach einem Sharepic-Format gefragt hast: Ich kann dir diese Kacheln direkt als ' +
      'fertige KI-Bilder oder Sharepics erstellen. Gib mir einfach kurz Bescheid, ob ich das übernehmen soll!';
    expect(offerToRecord({ recipeMentions: [], text, producedArtifact: false })).toEqual({
      kind: 'sharepic',
    });
  });

  it.each([
    ['Soll ich daraus ein Karussell machen?', 'sharepic'],
    ['Soll ich daraus eine Präsentation erstellen?', 'presentation'],
    ['Wenn du möchtest, kann ich daraus eine Tabelle machen.', 'sheet'],
  ])('reads the kind from the offer: %s', (offer, kind) => {
    expect(
      offerToRecord({ recipeMentions: [], text: `Text …\n\n${offer}`, producedArtifact: false })
    ).toEqual({ kind });
  });

  it.each([
    'Soll ich die Tabelle noch um eine Spalte ergänzen?',
    'Soll ich das Dokument noch kürzen?',
    'Ich kann dir leider keine Präsentation erstellen. Sag Bescheid, wenn du den Text anders willst.',
    'Passt das so?',
  ])('records nothing for an offer that creates nothing: %s', (offer) => {
    expect(
      offerToRecord({ recipeMentions: [], text: `Text …\n\n${offer}`, producedArtifact: false })
    ).toBeNull();
  });

  it('keeps the open offer through a rewrite that asks it again', () => {
    const text = 'Neue Fassung …\n\nSoll ich daraus ein Dokument machen, das du bearbeiten kannst?';
    expect(
      offerToRecord({ recipeMentions: [], text, producedArtifact: false, pendingOffer: 'document' })
    ).toEqual({ kind: 'document' });
    expect(
      offerToRecord({
        recipeMentions: [],
        text: 'Neue Fassung …\n\nPasst das so?',
        producedArtifact: false,
        pendingOffer: 'document',
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
