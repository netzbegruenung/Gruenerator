import { describe, expect, it } from 'vitest';

import {
  buildChatHandoffUrl,
  createRepeatGuard,
  readChatHandoff,
  withoutChatHandoff,
} from './chatHandoff';

const read = (url: string) => readChatHandoff(new URL(url, 'https://x.test').searchParams);

describe('chatHandoff', () => {
  it('carries question, filters and sources to the new tab', () => {
    const url = buildChatHandoffUrl('/berlin', {
      question: 'Was fordern die Grünen & warum?',
      filters: { content_type: ['pm'], themes: [] },
      sourceIds: ['a', 'b'],
    });
    expect(read(url)).toEqual({
      question: 'Was fordern die Grünen & warum?',
      filters: { content_type: ['pm'] },
      sourceIds: ['a', 'b'],
    });
  });

  it('leaves out what does not narrow anything', () => {
    const url = buildChatHandoffUrl('/berlin', { question: 'Frage', filters: {}, sourceIds: null });
    expect(url).toBe('/berlin?frage=Frage');
    expect(read(url)).toEqual({ question: 'Frage', filters: {}, sourceIds: null });
  });

  it('keeps an empty source selection instead of widening it to all', () => {
    const url = buildChatHandoffUrl('/x', { question: 'F', filters: {}, sourceIds: [] });
    expect(read(url)?.sourceIds).toEqual([]);
  });

  it('drops a malformed filter param instead of trusting it', () => {
    expect(read('/x?frage=F&filter=%7Bnope')?.filters).toEqual({});
    expect(read('/x?frage=F&filter=%5B1%5D')?.filters).toEqual({});
    expect(
      read('/x?frage=F&filter=%7B%22a%22%3A%5B1%5D%2C%22b%22%3A%5B%22v%22%5D%7D')?.filters
    ).toEqual({ b: ['v'] });
  });

  it('is nothing without a question', () => {
    expect(read('/x?filter=%7B%7D')).toBeNull();
    expect(read('/x?frage=%20')).toBeNull();
  });

  it('strips its params and keeps the thread', () => {
    expect(withoutChatHandoff('?frage=F&thread=t1&quellen=a')).toBe('?thread=t1');
    expect(withoutChatHandoff('?frage=F')).toBe('');
  });

  it('counts a held Enter or a double click once, a later or different question again', () => {
    const isRepeat = createRepeatGuard(1000);
    expect(isRepeat('F', 0)).toBe(false);
    expect(isRepeat('F', 30)).toBe(true);
    // A held key keeps repeating; the window slides with it.
    expect(isRepeat('F', 900)).toBe(true);
    expect(isRepeat('F', 1800)).toBe(true);
    expect(isRepeat('G', 1810)).toBe(false);
    expect(isRepeat('G', 3000)).toBe(false);
  });
});
