import { describe, it, expect } from 'vitest';

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
