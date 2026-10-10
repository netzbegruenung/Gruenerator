import {
  hasUnpairedHandMark,
  parseHandMarks,
  replaceHandMarks,
  sharepicSpecSchema,
  stripHandMarks,
} from '@gruenerator/contracts';
import { describe, expect, it } from 'vitest';

import { validateDraft } from './draftAgent.js';

const slideOf = (items: object[], locale = 'de-AT', color = 'dunkelgruen') => ({
  locale,
  slides: [
    { background: { kind: 'farbe', color }, position: 'mitte', align: 'links', items, logo: false },
  ],
});

describe('hand marks', () => {
  it('reads ((circle)) and __underline__ pairs', () => {
    expect(parseHandMarks('Achte dazwischen auf ((Pausen)):')).toEqual([
      { kind: 'kreis', text: 'Pausen' },
    ]);
    expect(parseHandMarks('__Herbert sagt:__ und ((5 Fakten,))')).toEqual([
      { kind: 'unterstrich', text: 'Herbert sagt:' },
      { kind: 'kreis', text: '5 Fakten,' },
    ]);
    expect(stripHandMarks('Die ((Lösung?)) ist __da__')).toBe('Die Lösung? ist da');
  });

  it('leaves snake__case, spaced and unpaired marks as text', () => {
    expect(parseHandMarks('snake__case__name')).toEqual([]);
    expect(parseHandMarks('(( Pausen))')).toEqual([]);
    expect(parseHandMarks('((a\nb))')).toEqual([]);
    expect(hasUnpairedHandMark('Die ((Lösung?')).toBe(true);
    expect(hasUnpairedHandMark('Die ((Lösung?)) und (Klammer)')).toBe(false);
  });

  it('rewrites only matched pairs', () => {
    expect(replaceHandMarks('a ((b)) __c__ ((d', (k, t) => `<${k}:${t}>`)).toBe(
      'a <kreis:b> <unterstrich:c> ((d'
    );
  });

  it('does not count the marks against a line limit', () => {
    const spec = slideOf([{ type: 'headline', lines: ['Ein ((Gespräch)) allein'] }]);
    expect(sharepicSpecSchema.safeParse(spec).success).toBe(true);
    const long = slideOf([{ type: 'headline', lines: ['((Dreiundzwanzig Zeichen))'] }]);
    expect(sharepicSpecSchema.safeParse(long).success).toBe(true);
  });

  it('allows two marks per slide and rejects a third', () => {
    const two = slideOf([
      { type: 'headline', lines: ['Die ((Lösung?))'] },
      { type: 'absatz', text: 'Für den __Abschluss__ empfehlen wir:' },
    ]);
    expect(sharepicSpecSchema.safeParse(two).success).toBe(true);
    const three = slideOf([
      { type: 'headline', lines: ['Die ((Lösung?))'] },
      { type: 'absatz', text: 'Für den __Abschluss__ empfehlen ((wir)):' },
    ]);
    const result = sharepicSpecSchema.safeParse(three);
    expect(!result.success && result.error.issues.map((i) => i.message).join()).toContain(
      'Höchstens 2 handgezeichnete'
    );
  });

  it('rejects a circle round a phrase and marks outside the free text', () => {
    const phrase = slideOf([{ type: 'absatz', text: '((Wir lassen Hass nicht gewinnen))' }]);
    const r1 = sharepicSpecSchema.safeParse(phrase);
    expect(!r1.success && r1.error.issues[0]!.message).toContain('kreist zu viel ein');
    const list = slideOf([{ type: 'liste', items: ['((Wind))', 'Sonne'] }]);
    const r2 = sharepicSpecSchema.safeParse(list);
    expect(!r2.success && r2.error.issues[0]!.message).toContain('nur in headline, absatz');
  });

  it('works in DE as in AT', () => {
    const de = slideOf([{ type: 'headline', lines: ['Ins __Schwitzen?__'] }], 'de-DE', 'tanne');
    expect(sharepicSpecSchema.safeParse(de).success).toBe(true);
  });

  it('sends a stray (( back to the model', () => {
    const draft = slideOf([{ type: 'absatz', text: 'Achte auf ((Pausen' }]);
    const result = validateDraft(draft, 'de-AT', 'Achte auf Pausen');
    expect(!result.ok && result.error).toContain('einzelnes (( oder ))');
    const fine = slideOf([{ type: 'absatz', text: 'Achte auf ((Pausen))' }]);
    expect(validateDraft(fine, 'de-AT', 'Achte auf Pausen').ok).toBe(true);
  });
});
