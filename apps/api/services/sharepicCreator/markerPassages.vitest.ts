import {
  countMarkerPassages,
  foldMarkerIntoAccent,
  hasUnpairedAccentMark,
  tightenAccentMarks,
} from '@gruenerator/contracts';
import { describe, expect, it } from 'vitest';

import { validateDraft } from './draftAgent.js';
import { validateReview } from './review.js';

const slideOf = (items: object[], color = 'tanne') => ({
  slides: [
    { background: { kind: 'farbe', color }, position: 'mitte', align: 'links', items, logo: true },
  ],
});
const QUOTE = 'Wir lassen niemanden zurück und wir bauen Wohnungen für alle.';
const zitat = (text: string) => ({ type: 'zitat', text, name: 'Felix Banaszak' });
const BRIEF = `Zitat: "${QUOTE}" sagt Felix Banaszak`;

describe('++marker++ passages', () => {
  it('tightens spaces inside a pair like ==, and leaves C++ alone', () => {
    expect(tightenAccentMarks('Wir ++ bauen Wohnungen ++ für alle')).toBe(
      'Wir ++bauen Wohnungen++ für alle'
    );
    expect(tightenAccentMarks('++ a ++ und ==  b ==')).toBe('++a++ und ==b==');
    expect(tightenAccentMarks('Ich mag C++ und C++ sehr')).toBe('Ich mag C++ und C++ sehr');
  });

  it('keeps the quote check blind to the marks: it compares words', () => {
    const marked = QUOTE.replace('niemanden zurück', '++niemanden zurück++');
    const result = validateDraft(slideOf([zitat(marked)]), 'de-DE', BRIEF);
    expect(result.ok).toBe(true);
    // A word that is not in the brief still fails, mark or not.
    const wrong = validateDraft(slideOf([zitat('Wir ++lieben Kuchen++ alle')]), 'de-DE', BRIEF);
    expect(!wrong.ok && wrong.error).toContain('nicht wörtlich');
  });

  it('allows up to two passages per slide in zitat, absatz and headline', () => {
    const two = QUOTE.replace('niemanden', '++niemanden++').replace('Wohnungen', '++Wohnungen++');
    expect(validateDraft(slideOf([zitat(two)]), 'de-DE', BRIEF).ok).toBe(true);
    expect(
      validateDraft(
        slideOf([{ type: 'absatz', text: 'Wir bauen ++Wohnungen++ für alle.' }]),
        'de-DE',
        'x'
      ).ok
    ).toBe(true);
    expect(
      validateDraft(
        slideOf([{ type: 'headline', lines: ['Reiche vernichten', '++186.600++ Jobs'] }]),
        'de-DE',
        '186.600'
      ).ok
    ).toBe(true);
  });

  it('rejects a third passage on one slide', () => {
    const three = QUOTE.replace('niemanden', '++niemanden++')
      .replace('Wohnungen', '++Wohnungen++')
      .replace('alle', '++alle++');
    const result = validateDraft(slideOf([zitat(three)]), 'de-DE', BRIEF);
    expect(!result.ok && result.error).toContain('Höchstens 2');
  });

  it('rejects ++ outside zitat, absatz and headline', () => {
    const result = validateDraft(
      slideOf([{ type: 'text', text: 'Alle ++jetzt++ mitmachen' }]),
      'de-DE',
      'x'
    );
    expect(!result.ok && result.error).toContain('nur in zitat, absatz und headline');
  });

  it('rejects an unpaired ++ with a repair message', () => {
    const result = validateDraft(
      slideOf([{ type: 'absatz', text: 'Wir ++bauen Wohnungen' }]),
      'de-DE',
      'x'
    );
    expect(!result.ok && result.error).toContain('++Passage++');
  });

  it('rejects ++ for Austria, which highlights with ==', () => {
    const result = validateDraft(
      slideOf([{ type: 'absatz', text: 'Wir bauen ++Wohnungen++ für alle.' }], 'dunkelgruen'),
      'de-AT',
      'x'
    );
    expect(!result.ok && result.error).toContain('Österreich');
  });

  it('rejects an unpaired ++ in review patch ops and tightens paired ones', () => {
    const bad = validateReview(
      { ok: false, issues: [], patch: [{ op: 'set_text', item: 0, text: 'Mach ++mit' }] },
      [1]
    );
    expect(!bad.ok && bad.error).toContain('++Passage++');
    const good = validateReview(
      { ok: false, issues: [], patch: [{ op: 'set_text', item: 0, text: 'Los ++jetzt ++' }] },
      [1]
    );
    expect(good.ok && good.value.patch[0]).toMatchObject({ text: 'Los ++jetzt++' });
  });

  it('folds a marker into an accent for Austria and leaves plain text untouched', () => {
    expect(foldMarkerIntoAccent('Wir ++bauen Wohnungen++ jetzt')).toBe(
      'Wir ==bauen Wohnungen== jetzt'
    );
    expect(foldMarkerIntoAccent('==a== und ++b++')).toBe('==a== und ==b==');
    expect(foldMarkerIntoAccent('snake_case_name and *x*')).toBe('snake_case_name and *x*');
  });

  it('treats C++ as text everywhere: no unpaired mark, no placement error', () => {
    expect(hasUnpairedAccentMark('Ich mag C++ sehr')).toBe(false);
    expect(hasUnpairedAccentMark('C++, Java und C++')).toBe(false);
    expect(countMarkerPassages('C++, Java und C++')).toBe(0);
    const result = validateDraft(
      slideOf([{ type: 'liste', items: ['Wir mögen C++', 'und Rust'] }]),
      'de-DE',
      'x'
    );
    expect(result.ok).toBe(true);
    const at = validateDraft(
      slideOf([{ type: 'absatz', text: 'Wir mögen C++ sehr' }], 'dunkelgruen'),
      'de-AT',
      'x'
    );
    expect(at.ok).toBe(true);
  });

  it('rejects marks that cross', () => {
    expect(hasUnpairedAccentMark('++a ==b++ c==')).toBe(true);
    expect(hasUnpairedAccentMark('++a ==b== c++')).toBe(false);
  });

  it('applies the passage rules to review patches', () => {
    const three = { op: 'set_text', item: 0, text: '++a++ ++b++ ++c++' };
    const bad = validateReview({ ok: false, issues: [], patch: [three] }, [1]);
    expect(!bad.ok && bad.error).toContain('höchstens 2');
    const slides = [
      {
        background: { kind: 'farbe', color: 'tanne' },
        position: 'mitte',
        align: 'links',
        items: [{ type: 'text', text: 'x' }],
        logo: true,
      },
    ] as never;
    const wrongItem = validateReview(
      { ok: false, issues: [], patch: [{ op: 'set_text', item: 0, text: 'Los ++jetzt++' }] },
      [1],
      slides
    );
    expect(!wrongItem.ok && wrongItem.error).toContain('nur in zitat, absatz und headline');
  });
});
