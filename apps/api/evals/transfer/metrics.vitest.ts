import { describe, expect, it } from 'vitest';

import {
  avgSentenceWords,
  extractNumbers,
  hasCheckTrailInMessage,
  pageChromeLines,
  hasClosingOffer,
  hasVisualBlockFence,
  lengthRatio,
  longSentenceShare,
  numberRecall,
  parseProtocolHeader,
  decodeEntities,
  stripTags,
} from './metrics.js';

describe('extractNumbers', () => {
  it('normalisiert Tausendertrenner', () => {
    expect(extractNumbers('10.500 km, 10 500 und 10500')).toEqual(['10500']);
  });
  it('liest Prozent und Jahre', () => {
    expect(extractNumbers('Bis 2030 sind es 12,5 %')).toEqual(['2030', '12,5']);
  });
});

describe('numberRecall', () => {
  it('zählt nur Zahlen ab zwei Ziffern', () => {
    expect(numberRecall('Es gibt 3 Wege, 10.500 km und 2030.', 'Es sind 10500 Kilometer.')).toBe(
      0.5
    );
  });
  it('null ohne Zahlen im Original', () => {
    expect(numberRecall('Keine Zahl 7', 'x')).toBeNull();
  });
});

describe('lengthRatio', () => {
  it('teilt die Längen', () => {
    expect(lengthRatio('abcd', 'ab')).toBe(0.5);
  });
});

describe('hasClosingOffer', () => {
  it('erkennt eine Schlussfrage', () => {
    expect(hasClosingOffer('Text.\n\nSoll ich daraus ein Sharepic machen?')).toBe(true);
    expect(hasClosingOffer('Text.\n\n_Soll ich ein Sharepic machen?_')).toBe(true);
  });
  it('ignoriert Fragen weiter oben', () => {
    expect(hasClosingOffer('Wer?\nA.\nB.\nC.')).toBe(false);
  });
});

describe('hasVisualBlockFence', () => {
  it('erkennt Fences', () => {
    expect(hasVisualBlockFence('```chart\n{}\n```')).toBe(true);
    expect(hasVisualBlockFence('```js\n```')).toBe(false);
  });
});

describe('hasCheckTrailInMessage', () => {
  it('erkennt Prüfspuren', () => {
    expect(hasCheckTrailInMessage('## Prüfbericht')).toBe(true);
    expect(hasCheckTrailInMessage('Abdeckungstabelle')).toBe(true);
    expect(hasCheckTrailInMessage('Alles gut.')).toBe(false);
  });
});

describe('parseProtocolHeader', () => {
  it('liest Markdown', () => {
    expect(parseProtocolHeader('# Prüfprotokoll: X\nUrteil: FREIGABE\nRunden: 2\n')).toEqual({
      urteil: 'FREIGABE',
      runden: 2,
    });
  });
  it('liest HTML', () => {
    expect(
      parseProtocolHeader('<h1>Prüfprotokoll: X</h1><p>Urteil: ÜBERARBEITUNG</p><p>Runden: 3</p>')
    ).toEqual({ urteil: 'ÜBERARBEITUNG', runden: 3 });
  });
  it('null ohne Kopf', () => {
    expect(parseProtocolHeader('Hallo')).toBeNull();
  });
});

describe('Satzlänge', () => {
  const text =
    '# Titel\n\n- Das ist kurz.\n- Hier sind genau fünf Wörter.\n\nEin sehr langer Satz mit vielen Wörtern darin, der mehr als zwölf Wörter hat, wirklich.\n\n_Status am Ende._';
  it('mittelt ohne Überschrift und Statuszeile', () => {
    expect(avgSentenceWords(text)).toBeCloseTo((3 + 5 + 15) / 3, 5);
  });
  it('Anteil langer Sätze', () => {
    expect(longSentenceShare(text)).toBeCloseTo(1 / 3, 5);
  });
  it('null bei leerem Text', () => {
    expect(avgSentenceWords('')).toBeNull();
  });
});

describe('pageChromeLines', () => {
  it('zählt Navigationszeilen, nicht Fliesstext', () => {
    expect(pageChromeLines('Weiter zum Inhalt\nSuche\n## Impressum\nDas Netz ist lang.')).toBe(3);
    expect(pageChromeLines('Die Suche nach Lösungen dauert.')).toBe(0);
  });
});

describe('stripTags / decodeEntities', () => {
  it('lässt kein Tag übrig, auch kein verschachteltes', () => {
    const out = stripTags('<scr<b>ipt>alert(1)</script>Text');
    expect(out).not.toMatch(/[<>]/);
    expect(out).toContain('Text');
  });
  it('entschlüsselt nur einmal', () => {
    expect(decodeEntities('&amp;lt;b&amp;gt; &uuml;')).toBe('&lt;b&gt; ü');
  });
});
