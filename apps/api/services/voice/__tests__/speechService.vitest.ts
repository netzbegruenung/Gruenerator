import { describe, expect, it, vi } from 'vitest';

import {
  SpeechQuotaExceededError,
  generateSpeechFiles,
  type SpeechDeps,
} from '../speechService.js';

const RATE = 24000;
const LIMIT = 1800;

/** `seconds` of PCM16 silence at the provider rate. */
function pcmSeconds(seconds: number): Buffer {
  return Buffer.alloc(seconds * RATE * 2);
}

interface Calls {
  texts: string[];
  formats: string[];
  shares: number;
  reserved: number[];
  adjusted: number[];
}

function deps(overrides: Partial<SpeechDeps> = {}): SpeechDeps & { calls: Calls } {
  const calls: Calls = { texts: [], formats: [], shares: 0, reserved: [], adjusted: [] };
  let used = 0;
  return {
    calls,
    generatePcm: vi.fn(async (text: string) => {
      calls.texts.push(text);
      return { pcm: pcmSeconds(2), sampleRate: RATE };
    }),
    encode: vi.fn(async (_wav: Buffer, format) => {
      calls.formats.push(format);
      return {
        buffer: Buffer.from(`encoded-${format}`),
        mimeType: format === 'mp3' ? ('audio/mpeg' as const) : ('audio/wav' as const),
        extension: format === 'mp3' ? ('mp3' as const) : ('wav' as const),
      };
    }),
    createAudioShare: vi.fn(async () => {
      calls.shares += 1;
      return {
        id: `id-${calls.shares}`,
        shareToken: `tok${calls.shares}`,
        shareUrl: `/share/tok${calls.shares}`,
        createdAt: new Date(),
      };
    }),
    counter: {
      reserve: vi.fn(async (_userId: string, seconds: number) => {
        calls.reserved.push(seconds);
        used += seconds;
        return { ok: true as const, status: { usedSeconds: used, limitSeconds: LIMIT } };
      }),
      adjust: vi.fn(async (_userId: string, delta: number) => {
        calls.adjusted.push(delta);
        used += delta;
        return { usedSeconds: used, limitSeconds: LIMIT };
      }),
    },
    ...overrides,
  };
}

const input = {
  preset: 'mailbox' as const,
  text: 'Hallo, hier ist der Kreisverband. Wir rufen zurück.',
  formats: ['wav_phone', 'mp3'] as const,
  voiceId: null,
  speed: null,
  signal: null,
};

const longText = Array.from({ length: 400 }, (_, i) => `Satz ${i} hat einige Wörter.`).join(' ');

describe('generateSpeechFiles', () => {
  it('synthesises once, encodes every format and stores one row each', async () => {
    const d = deps();
    const result = await generateSpeechFiles('u1', input, d);

    expect(d.calls.texts).toEqual([input.text]);
    expect(d.calls.formats.sort()).toEqual(['mp3', 'wav_phone']);
    expect(d.calls.shares).toBe(2);
    expect(result.chunks).toBe(1);
    expect(result.durationSeconds).toBe(2);
    expect(result.files.map((f) => f.format)).toEqual(['wav_phone', 'mp3']);
    expect(result.files[0]).toEqual({
      format: 'wav_phone',
      mediaId: 'id-1',
      shareToken: 'tok1',
      mimeType: 'audio/wav',
      fileSize: Buffer.byteLength('encoded-wav_phone'),
      shareUrl: '/share/tok1',
    });
  });

  it('reserves the estimate up front and reconciles to the real seconds', async () => {
    const d = deps();
    const result = await generateSpeechFiles('u1', input, d);
    const estimate = Math.ceil(input.text.length / 15);
    expect(d.calls.reserved).toEqual([estimate]);
    expect(d.calls.adjusted).toEqual([2 - estimate]);
    expect(result.quota).toEqual({ usedSeconds: 2, limitSeconds: LIMIT });
  });

  it('uses the preset title and passes voice, speed and signal through', async () => {
    const d = deps();
    const signal = new AbortController().signal;
    await generateSpeechFiles(
      'u1',
      { ...input, voiceId: '1930', speed: 1.1, signal, formats: ['mp3'] },
      d
    );
    expect(d.generatePcm).toHaveBeenCalledWith(input.text, {
      language: 'de',
      voiceId: '1930',
      speed: 1.1,
      signal,
    });
    expect(d.createAudioShare).toHaveBeenCalledWith(
      'u1',
      expect.objectContaining({ title: 'Anrufbeantworter-Ansage', durationSeconds: 2 })
    );
  });

  it('splits long text, joins the chunks with a silence gap and books the real total', async () => {
    const d = deps();
    const result = await generateSpeechFiles(
      'u1',
      { ...input, text: longText, formats: ['mp3'] },
      d
    );

    expect(result.chunks).toBeGreaterThan(1);
    expect(d.calls.texts.length).toBe(result.chunks);
    // n chunks of 2 s each plus (n-1) gaps of 0.3 s.
    const expected = result.chunks * 2 + (result.chunks - 1) * 0.3;
    expect(result.durationSeconds).toBeCloseTo(expected, 1);
    expect(result.quota.usedSeconds).toBe(Math.round(expected));
  });

  it('refuses before synthesising when the reservation does not fit', async () => {
    const d = deps({
      counter: {
        reserve: vi.fn(async () => ({ ok: false as const, reason: 'exceeded' as const })),
        adjust: vi.fn(),
      },
    });
    await expect(generateSpeechFiles('u1', input, d)).rejects.toBeInstanceOf(
      SpeechQuotaExceededError
    );
    expect(d.generatePcm).not.toHaveBeenCalled();
  });

  it('fails closed with a different message when the quota store is unavailable', async () => {
    const d = deps({
      counter: {
        reserve: vi.fn(async () => ({ ok: false as const, reason: 'unavailable' as const })),
        adjust: vi.fn(),
      },
    });
    await expect(generateSpeechFiles('u1', input, d)).rejects.toThrow(/nicht prüfen/);
  });

  it('still books the chunks the provider delivered when a later chunk fails', async () => {
    let call = 0;
    const d = deps({
      generatePcm: vi.fn(async () => {
        if (call++ === 1) throw new Error('provider stalled');
        return { pcm: pcmSeconds(2), sampleRate: RATE };
      }),
    });
    await expect(
      generateSpeechFiles('u1', { ...input, text: longText, formats: ['mp3'] }, d)
    ).rejects.toThrow('provider stalled');
    const estimate = Math.ceil(longText.length / 15);
    expect(d.calls.adjusted).toEqual([2 - estimate]);
    expect(d.encode).not.toHaveBeenCalled();
  });

  it('rejects a sample-rate change between chunks instead of joining garbage', async () => {
    let call = 0;
    const d = deps({
      generatePcm: vi.fn(async () => ({
        pcm: pcmSeconds(1),
        sampleRate: call++ === 0 ? 24000 : 22050,
      })),
    });
    await expect(
      generateSpeechFiles('u1', { ...input, text: longText, formats: ['mp3'] }, d)
    ).rejects.toThrow(/Hz/);
  });

  it('stops before encoding when the client has gone away', async () => {
    const abort = new AbortController();
    const d = deps({
      generatePcm: vi.fn(async () => {
        abort.abort();
        return { pcm: pcmSeconds(2), sampleRate: RATE };
      }),
    });
    await expect(generateSpeechFiles('u1', { ...input, signal: abort.signal }, d)).rejects.toThrow(
      /Verbindung/
    );
    expect(d.encode).not.toHaveBeenCalled();
    expect(d.calls.adjusted).toHaveLength(1);
  });
});
