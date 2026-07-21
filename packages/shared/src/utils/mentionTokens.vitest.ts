import { describe, expect, it } from 'vitest';

import {
  buildMentionToken,
  hasMentionTokens,
  parseMentionTokens,
  sanitizeMentionTokens,
} from './mentionTokens.js';

describe('mentionTokens', () => {
  it('builds and parses a roundtrip token', () => {
    const t = buildMentionToken('Tally', 'mcp', 'fb75887f-bf1c-4369-b880-c11d6e5a0d7a');
    expect(t).toBe('@[Tally](mcp:fb75887f-bf1c-4369-b880-c11d6e5a0d7a)');
    const parsed = parseMentionTokens(`erstelle ein formular mit ${t} bitte`);
    expect(parsed).toHaveLength(1);
    expect(parsed[0]).toMatchObject({
      label: 'Tally',
      type: 'mcp',
      id: 'fb75887f-bf1c-4369-b880-c11d6e5a0d7a',
    });
  });

  it('parses multiple tokens of mixed types in order', () => {
    const text = `${buildMentionToken('Klima', 'notebook', 'klima-berlin')} und ${buildMentionToken('Bild generieren', 'tool', 'image')}`;
    const parsed = parseMentionTokens(text);
    expect(parsed.map((t) => t.type)).toEqual(['notebook', 'tool']);
  });

  it('sanitizes labels with umlauts and inner parens', () => {
    const t = buildMentionToken('Grüne (AT) Programm', 'notebook', 'at-programm');
    expect(sanitizeMentionTokens(`was sagt ${t}?`, 'label')).toBe('was sagt @Grüne (AT) Programm?');
  });

  it('escapes ] and newlines out of labels at build time', () => {
    const t = buildMentionToken('a]b\nc', 'tool', 'image');
    expect(parseMentionTokens(t)).toHaveLength(1);
  });

  it('remove-mode strips tokens and collapses whitespace without joining lines', () => {
    const t = buildMentionToken('Bild generieren', 'tool', 'image');
    expect(sanitizeMentionTokens(`mach ${t} bitte`, 'remove')).toBe('mach bitte');
    expect(sanitizeMentionTokens(`zeile eins ${t}\nzeile zwei`, 'remove')).toBe(
      'zeile eins\nzeile zwei'
    );
  });

  it('rejects forged shapes: unknown type, oversized id, unterminated', () => {
    expect(parseMentionTokens('@[x](webhook:evil)')).toHaveLength(0);
    expect(parseMentionTokens(`@[x](tool:${'a'.repeat(200)})`)).toHaveLength(0);
    expect(parseMentionTokens('@[x](tool:image')).toHaveLength(0);
    expect(hasMentionTokens('@[x](tool:image)')).toBe(true);
    expect(hasMentionTokens('plain @mention text')).toBe(false);
  });

  it('leaves ordinary markdown links and bare mentions untouched', () => {
    const text = 'siehe [Doku](https://example.org) und @tally';
    expect(sanitizeMentionTokens(text, 'label')).toBe(text);
    expect(parseMentionTokens(text)).toHaveLength(0);
  });
});
