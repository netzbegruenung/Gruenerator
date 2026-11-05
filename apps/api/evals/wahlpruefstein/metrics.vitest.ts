import { describe, expect, it } from 'vitest';

import {
  genderMarks,
  hasFederalTitle,
  hasReleaseNote,
  segmentAnswers,
  wordCount,
} from './metrics.js';

const QUESTIONS = [
  { n: 1, text: 'Wird sich Ihre Partei für eine Verlängerung der Mietpreisbremse einsetzen?' },
  { n: 2, text: 'Wie wollen Sie den Bau bezahlbarer Wohnungen fördern?' },
];
const CATALOG = QUESTIONS.map((q) => `${q.n}. ${q.text}`).join('\n\n');

describe('segmentAnswers', () => {
  it('findet nummerierte Fragen und zieht den Katalogtext ab', () => {
    const text = [
      'Antworten auf die Wahlprüfsteine für den Mieterbund anlässlich der Bundestagswahl 2025',
      '',
      '1. Wird sich Ihre Partei für eine Verlängerung der Mietpreisbremse einsetzen?',
      'Ja. Wir werden die Mietpreisbremse verlängern.',
      '',
      '2. Wie wollen Sie den Bau bezahlbarer Wohnungen fördern?',
      'Mit einer neuen Wohngemeinnützigkeit.',
    ].join('\n');
    expect(segmentAnswers(text, QUESTIONS, CATALOG)).toEqual([
      { n: 1, answer: 'Ja. Wir werden die Mietpreisbremse verlängern.' },
      { n: 2, answer: 'Mit einer neuen Wohngemeinnützigkeit.' },
    ]);
  });

  it('findet unnummerierte Fragen über ihren Wortlaut', () => {
    const text = [
      '**Wird sich Ihre Partei für eine Verlängerung der Mietpreisbremse einsetzen?**',
      'Ja.',
      '**Wie wollen Sie den Bau bezahlbarer Wohnungen fördern?**',
      'Über Förderprogramme.',
    ].join('\n');
    expect(segmentAnswers(text, QUESTIONS, CATALOG).map((s) => s.answer)).toEqual([
      'Ja.',
      'Über Förderprogramme.',
    ]);
  });

  it('lässt eine fehlende Frage leer, statt die Zählung zu verschieben', () => {
    const text = '2. Wie wollen Sie den Bau bezahlbarer Wohnungen fördern?\nMit Förderung.';
    expect(segmentAnswers(text, QUESTIONS, CATALOG)).toEqual([
      { n: 1, answer: '' },
      { n: 2, answer: 'Mit Förderung.' },
    ]);
  });

  it('liest eine Aufzählung in der Antwort nicht als nächste Frage', () => {
    const text = [
      '1. Wird sich Ihre Partei für eine Verlängerung der Mietpreisbremse einsetzen?',
      'Ja, und zwar so:',
      '3. Ausnahmen streichen',
    ].join('\n');
    expect(segmentAnswers(text, QUESTIONS, CATALOG)[0]?.answer).toContain('Ausnahmen streichen');
  });
});

describe('Kopf, Gendern, Wörter', () => {
  it('erkennt die Titelzeile der Bundespartei und den LV-Freigabevermerk', () => {
    expect(
      hasFederalTitle(
        'Antworten auf die Wahlprüfsteine für den DFB anlässlich der Bundestagswahl 2025'
      )
    ).toBe(true);
    expect(hasFederalTitle('Hier sind die Antworten:')).toBe(false);
    expect(
      hasReleaseNote('Änderungen oder Kürzungen des Wortlauts bedürfen erneuter Freigabe.')
    ).toBe(true);
  });

  it('zählt Stern und Doppelpunkt getrennt', () => {
    expect(genderMarks('Mieter*innen und Ärzt:innen')).toEqual({ star: 1, colon: 1, binnenI: 0 });
  });

  it('zählt Wörter ohne Satzzeichen', () => {
    expect(wordCount('Ja. Wir werden – sofort – handeln.')).toBe(5);
  });
});
