import { describe, expect, it } from 'vitest';

import { chunkForSpeech } from '../speechChunker.js';

const sentence = (n: number): string => `Das ist Satz Nummer ${n} mit ein paar Wörtern drin.`;

describe('chunkForSpeech', () => {
  it('returns one chunk for short text and nothing for whitespace', () => {
    expect(chunkForSpeech('Hallo Welt.')).toEqual(['Hallo Welt.']);
    expect(chunkForSpeech('   \n\n ')).toEqual([]);
  });

  it('never exceeds maxChars and cuts only between sentences', () => {
    const text = Array.from({ length: 40 }, (_, i) => sentence(i + 1)).join(' ');
    const chunks = chunkForSpeech(text, 200);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(200);
      expect(chunk.endsWith('.')).toBe(true);
    }
    expect(chunks.join(' ')).toBe(text);
  });

  it('keeps German abbreviations inside a sentence', () => {
    const text = 'Wir treffen uns z.B. am Dienstag. Dr. Müller kommt auch.';
    expect(chunkForSpeech(text, 40)).toEqual([
      'Wir treffen uns z.B. am Dienstag.',
      'Dr. Müller kommt auch.',
    ]);
  });

  it('preserves paragraph breaks inside a chunk and normalises CRLF', () => {
    const text = 'Erster Absatz.\r\n\r\nZweiter Absatz.';
    expect(chunkForSpeech(text)).toEqual(['Erster Absatz.\n\nZweiter Absatz.']);
  });

  it('hard-splits a sentence longer than the budget at whitespace', () => {
    const words = Array.from({ length: 60 }, (_, i) => `wort${i}`).join(' ');
    const chunks = chunkForSpeech(words, 50);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(50);
      expect(chunk.startsWith(' ')).toBe(false);
    }
    expect(chunks.join(' ')).toBe(words);
  });

  it('still makes progress on a bogus tag longer than the whole budget', () => {
    const text = `<break ${'a'.repeat(300)}/>`;
    const chunks = chunkForSpeech(text, 100);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) expect(chunk.length).toBeLessThanOrEqual(100);
    expect(chunks.join('')).toBe(text);
  });

  it('never cuts through a <break/> tag', () => {
    const text = `aaaa aaaa <break time="500ms"/> bbbb bbbb`;
    const chunks = chunkForSpeech(text, 22);
    expect(chunks.join(' ')).toBe(text);
    for (const chunk of chunks) {
      const opens = (chunk.match(/<break/g) ?? []).length;
      const closes = (chunk.match(/\/>/g) ?? []).length;
      expect(opens).toBe(closes);
    }
  });
});
