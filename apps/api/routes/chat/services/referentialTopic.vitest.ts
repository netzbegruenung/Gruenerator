import { describe, it, expect } from 'vitest';

import { isReferentialCreation, resolveReferentialTopic } from './referentialTopic.js';

import type { ModelMessage } from 'ai';

const priorTurn: ModelMessage[] = [
  {
    role: 'user',
    content: 'recherchiere die aktuellen positionen zum artenschutz und erstell eine präsentation',
  },
  {
    role: 'assistant',
    content:
      'Ich habe die aktuellen Positionen zum Artenschutz recherchiert und eine Präsentation erstellt. Die Kerninhalte betreffen Massentierhaltung, Tierrechte und den Schutz der Artenvielfalt in Österreich.',
  },
  { role: 'user', content: 'visualisiere in einem sharepic' },
];

describe('isReferentialCreation', () => {
  it('flags instructions with no subject of their own', () => {
    expect(isReferentialCreation('visualisiere in einem sharepic')).toBe(true);
    expect(isReferentialCreation('mach eine Präsentation dazu')).toBe(true);
    expect(isReferentialCreation('erstell ein Board davon')).toBe(true);
    expect(isReferentialCreation('bitte eine schöne pdf erstellen')).toBe(true);
    expect(isReferentialCreation('also aus der tabelle')).toBe(true);
    expect(isReferentialCreation('erstelle ein dokument dazu')).toBe(true);
  });

  it('does NOT flag a request that names its own topic', () => {
    expect(isReferentialCreation('erstelle ein Sharepic zum Klimaschutz')).toBe(false);
    expect(isReferentialCreation('mach eine Präsentation über die Energiewende')).toBe(false);
    expect(isReferentialCreation('erstelle ein PDF zur Energiewende')).toBe(false);
  });
});

describe('resolveReferentialTopic', () => {
  it('inherits the prior turn subject for a referential follow-up', () => {
    const { text, inherited } = resolveReferentialTopic(
      'visualisiere in einem sharepic',
      priorTurn
    );
    expect(inherited).toBe(true);
    expect(text).toMatch(/Artenschutz/);
    // the instruction is preserved as a trailing task line
    expect(text).toMatch(/Aufgabe: visualisiere in einem sharepic/);
  });

  it('leaves a self-contained topic unchanged', () => {
    const msgs: ModelMessage[] = [
      { role: 'user', content: 'erstelle ein Sharepic zum Klimaschutz' },
    ];
    const { text, inherited } = resolveReferentialTopic(
      'erstelle ein Sharepic zum Klimaschutz',
      msgs
    );
    expect(inherited).toBe(false);
    expect(text).toBe('erstelle ein Sharepic zum Klimaschutz');
  });

  it('inherits the prior table turn for a pdf follow-up', () => {
    const msgs: ModelMessage[] = [
      { role: 'user', content: 'recherchiere die einwohnerzahlen deutscher städte' },
      {
        role: 'assistant',
        content:
          'Hier ist die Tabelle mit den 10 größten deutschen Städten nach Einwohnerzahl: Berlin 3.680.000, Hamburg 1.860.000, München 1.500.000 …',
      },
      { role: 'user', content: 'bitte eine schöne pdf erstellen' },
    ];
    const first = resolveReferentialTopic('bitte eine schöne pdf erstellen', msgs);
    expect(first.inherited).toBe(true);
    expect(first.text).toMatch(/Einwohnerzahl/);
    const followUp = resolveReferentialTopic('also aus der tabelle', [
      ...msgs,
      { role: 'assistant', content: 'PDF "Schönes PDF-Dokument" wurde erstellt.' },
      { role: 'user', content: 'also aus der tabelle' },
    ]);
    expect(followUp.inherited).toBe(true);
    expect(followUp.text).toMatch(/Berlin/);
  });

  it('does not inherit when there is no substantive prior turn', () => {
    const msgs: ModelMessage[] = [
      { role: 'user', content: 'hi' },
      { role: 'user', content: 'visualisiere das' },
    ];
    expect(resolveReferentialTopic('visualisiere das', msgs).inherited).toBe(false);
  });
});
