import { describe, expect, it } from 'vitest';

import { validateDraft } from './draftAgent.js';
import { alsoCarousel, namedSharepicForm } from './forms.js';

const BRIEF =
  'Good News: tagesschau.de meldet am 2.10.2026 „Erneuerbare decken erstmals mehr als 60 Prozent des Stroms“.';

const draft = (item: object) => ({
  slides: [
    {
      background: { kind: 'farbe', color: 'mint' },
      position: 'oben',
      align: 'links',
      items: [item],
      logo: false,
    },
  ],
});
const errorOf = (item: object) => {
  const result = validateDraft(draft(item), 'de-DE', BRIEF);
  return result.ok ? '' : result.error;
};

describe('validateDraft — schlagzeile', () => {
  it('takes a headline as printed in the brief', () => {
    const item = {
      type: 'schlagzeile',
      stil: 'karte',
      medium: 'tagesschau.de',
      titel: 'Erneuerbare decken erstmals mehr als 60 Prozent des Stroms',
      datum: '2.10.2026',
    };
    expect(errorOf(item)).toBe('');
  });

  it('sends back a headline the brief does not print', () => {
    const item = {
      type: 'schlagzeile',
      stil: 'ausriss',
      medium: 'Spiegel',
      titel: 'Rekord beim Ökostrom',
    };
    expect(errorOf(item)).toContain('steht nicht so im Auftrag');
  });
});

describe('forms — Belege und Spiele', () => {
  it.each([
    ['Bullshit-Bingo der Union zum Klimaschutz', 'bingo'],
    ['Das Pendler-Starterpack', 'infografik'],
    ['Good News: Ökostrom über 60 Prozent', 'schlagzeile'],
    ['Sharepic mit dem Zeitungsausschnitt von heute', 'schlagzeile'],
  ])('%s → %s', (text, form) => {
    expect(namedSharepicForm(text)).toBe(form);
  });

  it('holds "Karussell mit Bingo" to both', () => {
    expect(alsoCarousel('Karussell mit einem Bingo zur Klimapolitik', 'bingo')).toBe(true);
    expect(alsoCarousel('Bingo zur Klimapolitik, kein Karussell', 'bingo')).toBe(false);
    expect(alsoCarousel('Karussell zur Klimapolitik', 'karussell')).toBe(false);
  });
});
