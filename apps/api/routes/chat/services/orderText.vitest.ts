import { describe, it, expect } from 'vitest';

import { isReplaceOrder, orderMayMeanArtifact, orderText } from './orderText.js';

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

describe('orderMayMeanArtifact', () => {
  // Eine Weiche, die ihr Ziel an „Post" erkennt — genügt, um die Regel zu prüfen.
  const namesPost = (order: string) => /(?<!\p{L})post(?!\p{L})/iu.test(order);

  it('ohne Stoff darf die Weiche jeden Auftrag nehmen', () => {
    expect(orderMayMeanArtifact('übersetze das ins Englische', namesPost)).toBe(true);
    expect(orderMayMeanArtifact(`${newsletter} Bitte korrigieren.`, namesPost)).toBe(true);
    expect(orderMayMeanArtifact(`${longOrder}\n\nBitte kürzer halten.`, namesPost)).toBe(true);
    // Nur Stoff an den Rändern: kein Auftrag abgetrennt, also kein Stoff erkannt.
    expect(orderMayMeanArtifact(`${newsletter}\n\n${newsletter}`, namesPost)).toBe(true);
  });

  it.each([
    ['rechtschreibung korrigieren'],
    ['ins Englische übersetzen'],
    ['kürzer bitte'],
    ['mach ihn kürzer'],
  ])('mit Stoff nicht, wenn der Auftrag sein Ziel nicht nennt: %s', (order) => {
    expect(orderMayMeanArtifact(`${newsletter}\n\n${order}`, namesPost)).toBe(false);
    expect(orderMayMeanArtifact(`${order}\n\n${newsletter}`, namesPost)).toBe(false);
  });

  it('mit Stoff, wenn der Auftrag das Ziel nennt oder ersetzt', () => {
    expect(orderMayMeanArtifact(`${newsletter}\n\nübersetze den Post`, namesPost)).toBe(true);
    expect(orderMayMeanArtifact(`Ersetze den Text durch:\n\n${newsletter}`, namesPost)).toBe(true);
  });
});

describe('isReplaceOrder', () => {
  it.each([['Ersetze den Text durch:'], ['tausch es gegen den neuen Absatz']])(
    'erkennt: %s',
    (order) => {
      expect(isReplaceOrder(order)).toBe(true);
    }
  );

  it.each([['ersetze die Emojis'], ['übersetze das ins Englische']])('nicht: %s', (order) => {
    expect(isReplaceOrder(order)).toBe(false);
  });
});
