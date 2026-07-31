import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { groupGreenptWords, listenWithGreenpt, type GreenptWord } from '../greenptListen.js';

function word(w: string, start: number, end: number, speaker: number | null = null): GreenptWord {
  return { word: w, start, end, speaker };
}

describe('groupGreenptWords', () => {
  it('breaks on a speaker change', () => {
    const segments = groupGreenptWords([
      word('Hallo', 0, 0.4, 0),
      word('zusammen', 0.4, 0.9, 0),
      word('Danke', 1.0, 1.4, 1),
    ]);
    expect(segments).toEqual([
      { start: 0, end: 0.9, text: 'Hallo zusammen', speaker: 0 },
      { start: 1.0, end: 1.4, text: 'Danke', speaker: 1 },
    ]);
  });

  it('breaks on sentence end when there is no diarization to break on', () => {
    const segments = groupGreenptWords([
      word('Erster', 0, 0.4),
      word('Satz.', 0.4, 0.9),
      word('Zweiter', 1.0, 1.4),
    ]);
    expect(segments.map((s) => s.text)).toEqual(['Erster Satz.', 'Zweiter']);
    expect(segments.every((s) => s.speaker === null)).toBe(true);
  });

  it('returns nothing for no words', () => {
    expect(groupGreenptWords([])).toEqual([]);
  });
});

describe('listenWithGreenpt', () => {
  const originalKey = process.env.GREENPT_API_KEY;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    process.env.GREENPT_API_KEY = 'test-key';
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    if (originalKey === undefined) delete process.env.GREENPT_API_KEY;
    else process.env.GREENPT_API_KEY = originalKey;
  });

  function respond(alternative: unknown) {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ results: { channels: [{ alternatives: [alternative] }] } }),
    });
  }

  it('requests green-s-pro in multilingual mode with smart_format off', async () => {
    respond({ transcript: 'Hallo', words: [] });
    await listenWithGreenpt(Buffer.from('audio'), 'clip.mp3');

    const url = new URL(fetchMock.mock.calls[0][0] as string);
    expect(url.searchParams.get('model')).toBe('green-s-pro');
    expect(url.searchParams.get('language')).toBe('multi');
    expect(url.searchParams.get('punctuate')).toBe('true');
    // English-only per the docs, and it corrupts German numerals and casing.
    expect(url.searchParams.get('smart_format')).toBe('false');
    expect(url.searchParams.get('diarize_model')).toBeNull();
  });

  it('asks for diarization v2 only when requested', async () => {
    respond({ transcript: 'Hallo', words: [] });
    await listenWithGreenpt(Buffer.from('audio'), 'clip.mp3', { diarize: true });
    const url = new URL(fetchMock.mock.calls[0][0] as string);
    expect(url.searchParams.get('diarize_model')).toBe('v2');
  });

  it('converts number words in transcript and words identically', async () => {
    respond({
      transcript: 'Im Jahr zweitausendfünfzehn waren es zehn Prozent',
      words: [
        { punctuated_word: 'Im', start: 0, end: 0.2 },
        { punctuated_word: 'Jahr', start: 0.2, end: 0.4 },
        { punctuated_word: 'zweitausendfünfzehn', start: 0.4, end: 1.2 },
        { punctuated_word: 'waren', start: 1.2, end: 1.4 },
        { punctuated_word: 'es', start: 1.4, end: 1.5 },
        { punctuated_word: 'zehn', start: 1.5, end: 1.8 },
        { punctuated_word: 'Prozent', start: 1.8, end: 2.2 },
      ],
    });

    const result = await listenWithGreenpt(Buffer.from('audio'), 'clip.mp3');

    expect(result.text).toBe('Im Jahr 2015 waren es 10 Prozent');
    // Every word must still be findable in the transcript, or the subtitle
    // position mapping falls back to a word join.
    for (const w of result.words) {
      expect(result.text).toContain(w.word);
    }
  });

  it('prefers punctuated_word over the bare lowercase word', async () => {
    respond({
      transcript: 'Hallo Welt.',
      words: [
        { word: 'hallo', punctuated_word: 'Hallo', start: 0, end: 0.4 },
        { word: 'welt', punctuated_word: 'Welt.', start: 0.4, end: 0.8 },
      ],
    });
    const result = await listenWithGreenpt(Buffer.from('audio'), 'clip.mp3');
    expect(result.words.map((w) => w.word)).toEqual(['Hallo', 'Welt.']);
  });

  it('throws instead of returning an empty transcript when the shape changes', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ results: { channels: [] } }) });
    await expect(listenWithGreenpt(Buffer.from('a'), 'clip.mp3')).rejects.toThrow(
      /no transcript alternative/i
    );
  });

  it('surfaces HTTP failures so the provider chain can fail over', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 503, text: async () => 'upstream down' });
    await expect(listenWithGreenpt(Buffer.from('a'), 'clip.mp3')).rejects.toThrow(/503/);
  });

  it('refuses to run without a key', async () => {
    delete process.env.GREENPT_API_KEY;
    await expect(listenWithGreenpt(Buffer.from('a'), 'clip.mp3')).rejects.toThrow(
      /GREENPT_API_KEY/
    );
  });
});
