import { describe, it, expect } from 'vitest';

import { orderText } from './orderText.js';

// Der eingefügte Newsletter vom beta-Lauf (#3912), gekürzt auf die Reizwörter.
const newsletter =
  'Neu im Grünerator: der Untertitler versieht Reels automatisch mit Untertiteln, und die Suche findet jetzt auch ältere Beschlüsse. Schreibt uns eure Rückmeldungen, wir freuen uns über jede Idee und jeden Hinweis!';

// > 120 Zeichen, beginnt aber wie ein Auftrag.
const longOrder =
  'Schreib eine Rede über Klimaschutz für den Ortsverband Musterstadt, mit Fokus auf Wärmepumpen, kommunale Wärmeplanung und die Sanierung von Schulgebäuden';

describe('orderText', () => {
  it('nimmt den Auftrag unter dem Stoff', () => {
    expect(orderText(`${newsletter}\n\nrechtschreibung korrigieren`)).toBe(
      'rechtschreibung korrigieren'
    );
  });

  it('nimmt den Auftrag über dem Stoff', () => {
    expect(orderText(`Kannst du das lektorieren?\n\n${newsletter}`)).toBe(
      'Kannst du das lektorieren?'
    );
  });

  it('behält einen langen Auftrag neben einem kurzen Nachsatz', () => {
    expect(longOrder.length).toBeGreaterThan(120);
    expect(orderText(`${longOrder}\n\nBitte kürzer halten.`)).toBe(
      `${longOrder}\n\nBitte kürzer halten.`
    );
  });

  it('lässt einen einzigen Absatz unverändert', () => {
    expect(orderText(`${newsletter} Bitte korrigieren.`)).toBe(`${newsletter} Bitte korrigieren.`);
    expect(orderText('  mach den Untertitel im Reel kürzer  ')).toBe(
      'mach den Untertitel im Reel kürzer'
    );
  });

  it('übergeht eine kurze Zeile mitten im Stoff', () => {
    expect(
      orderText(`${newsletter}\n\nSchreibt uns!\n\n${newsletter}\n\nübersetze das ins Englische`)
    ).toBe('übersetze das ins Englische');
  });

  it('bleibt beim ganzen Text, wenn beide Ränder langer Stoff sind', () => {
    const text = `${newsletter}\n\n${newsletter}`;
    expect(orderText(text)).toBe(text);
  });
});
