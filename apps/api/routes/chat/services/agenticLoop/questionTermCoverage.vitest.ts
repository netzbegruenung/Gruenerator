import { describe, expect, it } from 'vitest';

import { buildUncoveredTermNote, missingQuestionTerms } from './questionTermCoverage.js';

// Die Quellen aus dem Lauf von #5141 (gekürzt): das Regierungsprogramm zur
// Milliardärssteuer und zwei Web-Treffer, die nur „Mars" kennen.
const MARS_SOURCES = `[2] Regierungsprogramm 2025 – Zusammen wachsen (gruene.de)
Wir setzen uns für eine globale Milliardärssteuer ein und wollen eine Vermögenssteuer auf sehr hohe Vermögen. Die Erbschaftsteuer reformieren wir.
[6] Sollen wir den Mars besiedeln? (reddit.com)
Diskussion über eine Marsbesiedlung und ihre Kosten.
[13] hallo-wippingen.de
Mars-Abend im Gemeindehaus.`;

describe('missingQuestionTerms', () => {
  it('meldet den Gegenstand, den keine Quelle kennt (#5141)', () => {
    expect(
      missingQuestionTerms('Was sagen die Grünen zur Marskolonie-Steuer?', MARS_SOURCES)
    ).toEqual(['Marskolonie']);
  });

  it.each([
    // Fugen-s: die Quelle schreibt „Vermögenssteuer".
    ['Was sagen die Grünen zur Vermögensteuer?', MARS_SOURCES],
    // Flexion und Kompositum.
    ['Wie stehen die Grünen zur Wehrpflicht?', 'Die Wehrpflichtigen sollen …'],
    ['Was sagen die Grünen zum Klimageld?', 'Höhe des Klimageldes pro Kopf'],
    // Kompositum sinngemäß: beide Teile stehen da (live 29.10.2026, Grundsatzprogramm).
    [
      'Was sagen die Grünen zur Vermögensteuer?',
      'Das Aufkommen der Steuern aus großen Vermögen soll deutlich erhöht werden.',
    ],
    // Umlaut transliteriert.
    ['Was sagen die Grünen zur Wärmeplanung?', 'Kommunale Waermeplanung bis 2028'],
  ])('gedeckt: %s', (question, sources) => {
    expect(missingQuestionTerms(question, sources)).toEqual([]);
  });

  it.each([
    // Rahmenwörter sind kein Gegenstand.
    'Was sagen die Grünen zum Wahlprogramm?',
    'Gibt es einen Unterschied zwischen den Positionen?',
    'Gibt es Informationen zur Beschlusslage?',
    // Kein Gegenstand hinter einer Präposition.
    'Wer ist Ricarda Lang?',
    // Kleingeschrieben oder zu kurz.
    'Was sagen die Grünen zu Tempo 30?',
  ])('kein Kandidat: %s', (question) => {
    expect(missingQuestionTerms(question, 'Völlig anderer Text über Radwege.')).toEqual([]);
  });

  it('schweigt ohne Quellen und bei einem langen Einschub', () => {
    expect(missingQuestionTerms('Was sagen die Grünen zur Marskolonie-Steuer?', '  ')).toEqual([]);
    expect(
      missingQuestionTerms(`${'Bitte lies das. '.repeat(30)} zur Marskolonie-Steuer?`, 'Radwege')
    ).toEqual([]);
  });
});

describe('buildUncoveredTermNote', () => {
  it('nennt den Begriff und verbietet den Beleg dafür', () => {
    const note = buildUncoveredTermNote(
      'Was sagen die Grünen zur Marskolonie-Steuer?',
      MARS_SOURCES
    );
    expect(note).toContain('GEGENSTAND OHNE QUELLE: „Marskolonie“');
    expect(note).toMatch(/Belege eine Aussage über „Marskolonie“ nur mit einer Quelle/);
    expect(note).toMatch(/keiner Partei eine Haltung dazu zu/);
  });

  it('ist leer, wenn alles gedeckt ist', () => {
    expect(buildUncoveredTermNote('Was sagen die Grünen zur Vermögensteuer?', MARS_SOURCES)).toBe(
      ''
    );
  });
});
