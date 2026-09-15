import { describe, it, expect } from 'vitest';

import {
  ARTIFACT_CONFIRMATION_TEXTS,
  buildSharepicConfirmation,
  isArtifactConfirmation,
} from './artifactConfirmations.js';

describe('isArtifactConfirmation', () => {
  // The drift guard: reword a confirmation so the matcher no longer sees it and
  // findPriorSubject starts inheriting the boilerplate again.
  it('recognises every text this module produces', () => {
    const texts = [
      ...Object.values(ARTIFACT_CONFIRMATION_TEXTS),
      buildSharepicConfirmation(1),
      buildSharepicConfirmation(3),
      buildSharepicConfirmation(1, 5),
    ];
    for (const text of texts) {
      expect(isArtifactConfirmation(text), text).toBe(true);
    }
  });

  it('still recognises the create_* templates', () => {
    expect(isArtifactConfirmation('PDF **"Klimaschutz"** wurde erstellt.')).toBe(true);
    expect(isArtifactConfirmation('Die wiederkehrende Aufgabe wurde eingerichtet — täglich.')).toBe(
      true
    );
  });

  it('does not swallow a real answer that merely opens like one', () => {
    const realAnswer =
      'Ich habe dir eine Übersicht erstellt: Klimaanlagen in Schulen senken die Innenraumtemperatur ' +
      'um bis zu 8 Grad, was in Hitzeperioden die Konzentrationsfähigkeit messbar erhält. Die ' +
      'Anschaffungskosten liegen je nach Gebäude zwischen 15.000 und 40.000 Euro pro Klassenraum, ' +
      'die Betriebskosten lassen sich über Photovoltaik auf dem Schuldach weitgehend decken. ' +
      'Mehrere Bundesländer fördern das inzwischen aus dem Klimaanpassungsprogramm.';
    expect(realAnswer.length).toBeGreaterThan(320);
    expect(isArtifactConfirmation(realAnswer)).toBe(false);
  });

  it('does not flag ordinary prose', () => {
    expect(isArtifactConfirmation('Klimaanlagen in Schulen sind kein Luxus.')).toBe(false);
    expect(isArtifactConfirmation('')).toBe(false);
  });
});

describe('confirmation builders', () => {
  it('pluralises the variant count', () => {
    expect(buildSharepicConfirmation(1)).toContain('1 Sharepic-Variante');
    expect(buildSharepicConfirmation(3)).toContain('3 Sharepic-Varianten');
  });

  it('reports a deck only when it has slides', () => {
    expect(buildSharepicConfirmation(1, 5)).toContain('Slider-Karussell mit 5 Folien');
    expect(buildSharepicConfirmation(1, 0)).toContain('Sharepic-Variante');
  });
});
