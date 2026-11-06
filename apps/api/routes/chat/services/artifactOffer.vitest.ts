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

  it('names the artifact in an optional closing offer', () => {
    const note = offerNote(state(), ['sprechzettel']);
    expect(note).toContain('ABSCHLUSS (freiwillig)');
    expect(note).toContain('Präsentation');
  });

  // Live 06.11.2026: „schließe mit genau EINER kurzen Rückfrage … Keine andere
  // Rückfrage" hielt Gemma 4 31B in einer Endlosschleife aus Selbstkorrekturen.
  it('neither demands the offer nor dictates its wording', () => {
    vorlagenCatalog.size = 0;
    const note = offerNote(state(), ['instagram']);
    expect(note).not.toMatch(/genau EINER|Keine andere Rückfrage|schließe mit/);
    expect(note).toContain('als Frage oder als kurzer Satz');
  });

  it('offers nothing the thread already has, not just this turn', () => {
    vorlagenCatalog.size = 3;
    const withSharepic = state({ threadArtifacts: [{ kind: 'sharepic' }] });
    // Weder die Galerie noch das Sharepic selbst.
    expect(offerNote(withSharepic, ['instagram'])).toBe('');
    vorlagenCatalog.size = 0;
    expect(offerNote(withSharepic, ['instagram'])).toBe('');
    expect(
      offerNote(state({ threadArtifacts: [{ kind: 'presentation' }] }), ['sprechzettel'])
    ).toBe('');
    // Eine andere Art im Thread hält das Angebot nicht auf.
    expect(offerNote(state({ threadArtifacts: [{ kind: 'document' }] }), ['instagram'])).toContain(
      'Sharepic'
    );
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
  // ERSTELLUNG formuliert. Fürs Sharepic mit eigenem Prädikat (#5412), für die
  // übrigen Arten mit dem Bestell-Prädikat.
  it('records an offer to create, even without a recipe', () => {
    expect(
      offerToRecord({
        recipeMentions: [],
        text: 'Soll ich daraus ein Sharepic machen?',
        producedArtifact: false,
      })
    ).toEqual({ kind: 'sharepic' });
  });

  // Das live gestellte Angebot (06.11.2026). Ein Trenner an jedem Punkt las es
  // als „2026 erstellen?" — ohne „Sharepic", also ungespeichert.
  it.each([
    'Soll ich daraus ein Sharepic mit dem Hinweis auf den Bauausschuss am 19.11.2026 erstellen?',
    'Soll ich daraus ein Sharepic zum Bauausschuss am 19. November machen?',
  ])('records an offer whose details carry dots: %s', (offer) => {
    for (const recipeMentions of [['instagram'], []]) {
      expect(
        offerToRecord({ recipeMentions, text: `${post}\n\n${offer}`, producedArtifact: false })
      ).toEqual({ kind: 'sharepic' });
    }
  });

  // Ohne Fragezeichen trägt nur der Ich-Form-Satz das Angebot: ein Trenner
  // hinter „z.B." liess „Ich kann dir z.B." übrig, ohne „Sharepic" (Claude
  // Review, #5410). Als Frage fiel es nicht auf — dort fängt `lastQuestion` den
  // hinteren Rest mit „Sharepic" auf.
  it.each([
    'Ich kann dir z.B. ein Sharepic daraus machen.',
    'Wenn du magst, mache ich dir ggf. noch ein Sharepic dazu.',
    'Ich kann dir daraus bzw. aus dem Post ein Sharepic machen.',
  ])('records a statement offer around an abbreviation: %s', (offer) => {
    for (const recipeMentions of [['instagram'], []]) {
      expect(
        offerToRecord({ recipeMentions, text: `${post}\n\n${offer}`, producedArtifact: false })
      ).toEqual({ kind: 'sharepic' });
    }
  });

  // Ohne Rezept las bis #5412 das Bestell-Prädikat das Angebot. Es verlangt
  // das Verb nah am Nomen und gibt einem genannten Post den Vortritt, weil
  // „Erstelle einen Post mit Sharepic" ein Schreibauftrag ist. Ein Angebot
  // folgt dem fertigen Post: es nennt ihn, und das Verb steht, wo es will.
  it.each([
    'Ich kann dir daraus ein Sharepic zum Post machen.',
    'Soll ich dir zum Post noch ein passendes Sharepic dazu machen?',
    'Wenn du magst, kann ich dir noch ein Sharepic mit Termin und Ort der Sitzung im Rathaus erstellen.',
  ])('records a sharepic offer the order predicate would not read: %s', (offer) => {
    expect(
      offerToRecord({ recipeMentions: [], text: `${post}\n\n${offer}`, producedArtifact: false })
    ).toEqual({ kind: 'sharepic' });
  });

  // Die Kehrseite: kein Verb-Fenster heisst nicht „jedes Sharepic im Satz".
  it.each([
    'Ich kann dir leider kein Sharepic erstellen.',
    'Soll ich das Sharepic noch heller machen?',
    'Soll ich dein Sharepic um den Termin ergänzen?',
    'Soll ich dir erklären, was ein gutes Sharepic ausmacht?',
    'Soll ich dir zeigen, wie man ein Sharepic macht?',
  ])('records no sharepic for an offer that builds none: %s', (offer) => {
    expect(
      offerToRecord({ recipeMentions: [], text: `${post}\n\n${offer}`, producedArtifact: false })
    ).toBeNull();
  });

  // Das Angebot ist frei formuliert und muss keine Frage sein.
  it.each([
    'Wenn du magst, mache ich daraus ein Sharepic.',
    'Gern erstelle ich dir dazu noch ein Sharepic.',
    'Sag Bescheid, dann baue ich dir ein Sharepic daraus.',
  ])('records a first-person offer without a question mark: %s', (offer) => {
    for (const recipeMentions of [['instagram'], []]) {
      expect(
        offerToRecord({ recipeMentions, text: `${post}\n\n${offer}`, producedArtifact: false })
      ).toEqual({ kind: 'sharepic' });
    }
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

  // Ohne Leerzeile ist der Schlussabsatz die ganze Antwort — ein „ich kann"
  // am Anfang ist dann eine Einordnung, kein Angebot (Claude Review, #4613).
  it('ignores a first-person aside early in a single-paragraph reply', () => {
    const text =
      'Ich kann aus dieser Meldung sicher eine Tabelle machen, aber zuerst eine Einordnung: ' +
      'Die Novelle ändert drei Paragraphen. Das wirkt sich auf die Kommunen aus. ' +
      'Besonders betroffen sind kleine Gemeinden.';
    expect(offerToRecord({ recipeMentions: [], text, producedArtifact: false })).toBeNull();
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

  it('records no free-form offer for a kind the thread already has', () => {
    const text = 'Text …\n\nSoll ich daraus eine neue Folie machen?';
    expect(
      offerToRecord({
        recipeMentions: [],
        text,
        producedArtifact: false,
        threadKinds: ['presentation'],
      })
    ).toBeNull();
    expect(offerToRecord({ recipeMentions: [], text, producedArtifact: false })).toEqual({
      kind: 'presentation',
    });
  });

  it('records a sharepic offer even when the thread has one — no edit path would take the „ja"', () => {
    expect(
      offerToRecord({
        recipeMentions: [],
        text: 'Text …\n\nSoll ich daraus ein Sharepic machen?',
        producedArtifact: false,
        threadKinds: ['sharepic'],
      })
    ).toEqual({ kind: 'sharepic' });
  });

  it('a reader call to action at the end of a post is no offer', () => {
    expect(
      offerToRecord({
        recipeMentions: [],
        text: 'Post …\n\nMöchtest du dabei sein? Erstelle dein eigenes Sharepic auf gruenerator.de',
        producedArtifact: false,
      })
    ).toBeNull();
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

  it('drops a closing offer that is no question', () => {
    expect(
      offerTopic('Bist du dabei? Komm am Samstag!\n\nWenn du magst, mache ich daraus ein Sharepic.')
    ).toBe('Bist du dabei? Komm am Samstag!');
  });
});
