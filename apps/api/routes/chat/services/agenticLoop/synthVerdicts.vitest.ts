import { describe, it, expect } from 'vitest';

import { PHANTOM_CREATION_FALLBACK } from '../outputSanity.js';

import { finalizeAnswerText } from './synthVerdicts.js';

const base = { sourceCount: 0, seenTexts: [], knownArtifactRefs: [] };
const beta =
  'Vielen Dank für die Information und die Korrektur der Zahlen. Ich habe mir das notiert.';

describe('finalizeAnswerText — Erinnerungs-Behauptung (#3914)', () => {
  it('streicht den Behauptungssatz ohne memory-Schritt und meldet die Ersetzung', () => {
    const r = finalizeAnswerText({ ...base, text: beta, stepCount: 0 });
    expect(r.text).toBe('Vielen Dank für die Information und die Korrektur der Zahlen.');
    expect(r.replaced).toBe(true);
    expect(r.warnings.join()).toContain('memory claim without memory step');
  });

  it('lässt sie stehen, wenn ein memory-Schritt lief', () => {
    const r = finalizeAnswerText({ ...base, text: beta, stepCount: 1, memoryRan: true });
    expect(r.text).toBe(beta);
  });

  it('lässt „Dokument gespeichert" nach einem Erstellungs-Werkzeug stehen', () => {
    const text = 'Fertig. Ich habe das Dokument gespeichert.';
    expect(finalizeAnswerText({ ...base, text, stepCount: 1 }).text).toBe(text);
  });
});

describe('finalizeAnswerText — erfundene Sharepic-Bearbeitung', () => {
  const claim =
    'Ich habe dir das Sharepic überarbeitet. Sag mir, wenn noch etwas anders sein soll.';

  it('ersetzt die Behauptung ohne Sharepic-Schritt und meldet replaced', () => {
    const r = finalizeAnswerText({ ...base, text: claim, stepCount: 0 });
    expect(r.text).not.toContain('überarbeitet');
    expect(r.replaced).toBe(true);
  });

  it('lässt sie stehen, wenn ein Sharepic-Werkzeug lief', () => {
    const r = finalizeAnswerText({
      ...base,
      text: claim,
      stepCount: 1,
      editedArtifacts: new Set(['sharepic']),
    });
    expect(r.text).toBe(claim);
  });
});

describe('finalizeAnswerText — angekündigte Erstellung ohne Artefakt (#4611)', () => {
  const live =
    'Ich erstelle dir jetzt die Sharepics für den Slider basierend auf dem Entwurf. (Hier erfolgt nun die Erstellung der Sharepics durch die entsprechenden Werkzeuge des Grünerators)';

  it('ersetzt die Ankündigung und schickt sie per completion', () => {
    const r = finalizeAnswerText({ ...base, text: live, stepCount: 0 });
    expect(r.text).toBe(PHANTOM_CREATION_FALLBACK);
    expect(r.replaced).toBe(true);
  });

  it('lässt sie stehen, wenn ein Artefakt entstanden ist', () => {
    const r = finalizeAnswerText({ ...base, text: live, stepCount: 1, createdArtifact: true });
    expect(r.text).toBe(live);
  });

  it('lässt sie stehen, wenn ein Werkzeug ein Artefakt geändert hat', () => {
    const r = finalizeAnswerText({
      ...base,
      text: live,
      stepCount: 1,
      editedArtifacts: new Set(['sharepic'] as const),
    });
    expect(r.text).toBe(live);
  });
});

describe('finalizeAnswerText — erfundener Werkzeug-Fehlschlag (06.11.2026)', () => {
  const live =
    'Es tut mir leid, der Aufruf zur Bilderstellung ist gerade fehlgeschlagen. Ich kann dir aber anbieten, ein Bild zu beschreiben.';

  it('streicht den Satz bei steps=0 und meldet replaced', () => {
    const r = finalizeAnswerText({ ...base, text: live, stepCount: 0 });
    expect(r.text).toBe('Ich kann dir aber anbieten, ein Bild zu beschreiben.');
    expect(r.replaced).toBe(true);
    expect(r.warnings.join()).toContain('tool failure claim without a tool step');
  });

  it('lässt ihn stehen, wenn ein Werkzeug lief und scheiterte', () => {
    const r = finalizeAnswerText({ ...base, text: live, stepCount: 1 });
    expect(r.text).toBe(live);
    expect(r.replaced).toBe(false);
  });
});

describe('finalizeAnswerText — Abwesenheitsbehauptung ohne Suche (#5458)', () => {
  const live = 'In den vorliegenden Unterlagen kommt Gernot Stöglehner nicht vor.';

  it('meldet sie bei steps=0, ohne den Text zu ändern', () => {
    const r = finalizeAnswerText({ ...base, text: live, stepCount: 0 });
    expect(r.text).toBe(live);
    expect(r.replaced).toBe(false);
    expect(r.warnings.join()).toContain('absence claim without searching (#5458)');
  });

  it('schweigt, wenn ein Werkzeug lief', () => {
    const r = finalizeAnswerText({ ...base, text: live, stepCount: 2 });
    expect(r.warnings.join()).not.toContain('absence claim');
  });
});
