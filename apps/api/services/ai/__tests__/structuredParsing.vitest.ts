import { describe, expect, it } from 'vitest';

import { jsonCandidatesFromText, viaLaxParser, withContent } from '../structuredParsing.js';

describe('jsonCandidatesFromText', () => {
  it('extracts JSON from every shape a text answer takes', () => {
    expect(jsonCandidatesFromText('{"title":"A"}')).toEqual([{ title: 'A' }]);
    expect(jsonCandidatesFromText('Hier:\n```json\n{"title":"B"}\n```')).toContainEqual({
      title: 'B',
    });
    expect(jsonCandidatesFromText('Vorrede {"title":"C"} Nachrede')).toContainEqual({ title: 'C' });
    expect(jsonCandidatesFromText('Ich kann das leider nicht.')).toEqual([]);
  });
});

describe('viaLaxParser', () => {
  it('runs the caller’s normalizing parser on the object, not on prose', () => {
    const gate = viaLaxParser<{ n: number }>((raw) => {
      const parsed = JSON.parse(raw) as { n?: unknown };
      return typeof parsed.n === 'number' ? { n: parsed.n } : null;
    }, 'n fehlt');

    expect(gate({ n: 3 })).toEqual({ ok: true, value: { n: 3 } });
    expect(gate({ m: 3 })).toEqual({ ok: false, error: 'n fehlt' });
  });
});

describe('withContent', () => {
  it('turns an empty-content result into the null the gate expects', () => {
    const parse = withContent((raw: string) => ({ content: raw }));

    expect(parse('etwas')).toEqual({ content: 'etwas' });
    expect(parse('')).toBeNull();
  });
});
