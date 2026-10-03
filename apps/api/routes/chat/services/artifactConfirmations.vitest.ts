import { type SharepicSpec, type SharepicVariant } from '@gruenerator/contracts';
import { describe, it, expect } from 'vitest';

import {
  ARTIFACT_CONFIRMATION_TEXTS,
  buildSharepicConfirmation,
  isArtifactConfirmation,
} from './artifactConfirmations.js';

const legacy = (n: number): SharepicVariant[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `v${i}`,
    canvasType: 'dreizeilen',
    initialProps: {},
  }));

const deck = (slides: number): SharepicVariant[] => [
  {
    id: 'd',
    canvasType: 'dreizeilen',
    initialProps: {},
    pages: Array.from({ length: slides }, () => ({})),
  },
];

const spec = (slides: number): SharepicSpec => ({
  locale: 'de-DE',
  slides: Array.from({ length: slides }, () => ({
    background: { kind: 'farbe' as const, color: 'tanne' as const },
    position: 'mitte' as const,
    align: 'links' as const,
    items: [{ type: 'headline' as const, lines: ['Busse statt Stau'] }],
    logo: false,
  })),
});

const creator = (slides: number, extra: Record<string, unknown> = {}): SharepicVariant[] => [
  {
    id: 'c',
    canvasType: 'freeform',
    initialProps: {
      creatorSpec: spec(slides),
      attributions: Array.from({ length: slides }, () => null),
      ...extra,
    },
  },
];

const CREATOR_TEXTS = {
  draft: buildSharepicConfirmation(creator(1)),
  carousel: buildSharepicConfirmation(creator(4)),
  revision: buildSharepicConfirmation(creator(1, { revisionOf: 'old' })),
  revisionEditor: buildSharepicConfirmation(
    creator(1, { revisionOf: 'old', editorChangesDropped: true })
  ),
};

describe('isArtifactConfirmation', () => {
  // The drift guard: reword a confirmation so the matcher no longer sees it and
  // findPriorSubject starts inheriting the boilerplate again.
  it('recognises every text this module produces', () => {
    const texts = [
      ...Object.values(ARTIFACT_CONFIRMATION_TEXTS),
      buildSharepicConfirmation(legacy(1)),
      buildSharepicConfirmation(legacy(3)),
      buildSharepicConfirmation(deck(5)),
      ...Object.values(CREATOR_TEXTS),
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
    expect(buildSharepicConfirmation(legacy(1))).toContain('1 Sharepic-Variante');
    expect(buildSharepicConfirmation(legacy(3))).toContain('3 Sharepic-Varianten');
  });

  it('reports a deck only when it has slides', () => {
    expect(buildSharepicConfirmation(deck(5))).toContain('Slider-Karussell mit 5 Folien');
    expect(buildSharepicConfirmation(deck(0))).toContain('Sharepic-Variante');
  });

  it('confirms a creator draft, a carousel and a revision', () => {
    expect(CREATOR_TEXTS.draft).toMatch(/^Ich habe dir ein Sharepic entworfen\./);
    expect(CREATOR_TEXTS.draft).toContain('ganz andere Variante');
    expect(CREATOR_TEXTS.carousel).toMatch(/^Ich habe dir ein Karussell mit 4 Folien entworfen\./);
    expect(CREATOR_TEXTS.revision).toMatch(/^Ich habe dir das Sharepic überarbeitet\./);
    expect(CREATOR_TEXTS.revision).not.toContain('Editor');
    expect(CREATOR_TEXTS.revisionEditor).toContain('im Editor');
  });
});
