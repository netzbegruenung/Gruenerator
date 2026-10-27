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
