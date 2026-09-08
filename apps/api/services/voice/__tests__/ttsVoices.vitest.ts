/**
 * `listVoices` against a fake KugelAudio: the provider ignores `?language=`
 * and pages at 20 by default, so the German catalogue only comes out right
 * when the service walks every page and filters itself.
 *
 * Run: `npx vitest run services/voice/__tests__/ttsVoices.vitest.ts`
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../utils/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

vi.mock('../../../config/env.js', () => ({
  env: { KUGELAUDIO_API_KEY: 'test-key' },
}));

vi.mock('../../usage/UsageTrackingService.js', () => ({
  recordOperation: vi.fn(),
}));

const { default: ttsService } = await import('../ttsService.js');

const CATALOGUE = [
  {
    id: 1930,
    name: 'Antonia Meier',
    sex: 'female',
    age: 'middle_age',
    quality: 'high',
    description: 'Ruhig und klar.',
    supported_languages: ['de-DE'],
    sample_url: 'https://cdn.example/1930.wav',
  },
  { id: 12, name: 'Emma', sex: 'female', supported_languages: ['en-GB'] },
  { id: 263, name: 'Österreichische Irmgard', sex: 'female', supported_languages: ['de-DE'] },
];

function fakeProvider(pageSize: number) {
  return vi.fn(async (input: URL | string) => {
    const url = new URL(String(input));
    const offset = Number(url.searchParams.get('offset') ?? '0');
    const limit = Math.min(Number(url.searchParams.get('limit') ?? '20'), pageSize);
    const voices = CATALOGUE.slice(offset, offset + limit);
    return new Response(JSON.stringify({ voices, total: CATALOGUE.length, limit, offset }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  });
}

describe('ttsService.listVoices', () => {
  let fetchMock: ReturnType<typeof fakeProvider>;

  beforeEach(() => {
    fetchMock = fakeProvider(2);
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('walks every page and keeps only the requested language', async () => {
    const voices = await ttsService.listVoices('de');

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(voices.map((v) => v.id)).toEqual(['1930', '263']);
  });

  it('matches on the primary subtag, so de-AT callers get the de-DE catalogue', async () => {
    const voices = await ttsService.listVoices('de-AT');
    expect(voices.map((v) => v.id)).toEqual(['1930', '263']);
  });

  it('exposes the fields a listener needs to pick a voice', async () => {
    const [antonia] = await ttsService.listVoices('de-DE');

    expect(antonia).toEqual({
      id: '1930',
      name: 'Antonia Meier',
      languages: ['de-DE'],
      gender: 'female',
      age: 'middle_age',
      quality: 'high',
      description: 'Ruhig und klar.',
      sampleUrl: 'https://cdn.example/1930.wav',
    });
  });

  it('returns the whole catalogue without a language', async () => {
    const voices = await ttsService.listVoices();
    expect(voices).toHaveLength(3);
  });

  it('surfaces a provider error instead of an empty list', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('nope', { status: 503 }))
    );
    await expect(ttsService.listVoices('de')).rejects.toThrow('503');
  });
});
