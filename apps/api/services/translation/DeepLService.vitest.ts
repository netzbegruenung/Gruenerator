/**
 * Pins the parts of the DeepL client that the docs make load-bearing: the
 * free/pro host split, which statuses are retried (429 yes, 456 and 400 never),
 * that the one-shot document download is never retried, the trace id in the
 * log line, and the languages cache.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../config/env.js', () => ({
  env: { DEEPL_API_KEY: 'pro-key', LOG_LEVEL: 'warn' },
}));

const warn = vi.fn();
vi.mock('../../utils/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn, error: vi.fn(), debug: vi.fn() }),
}));

const getCachedJson = vi.fn();
const setCachedJson = vi.fn();
vi.mock('../../utils/redis/jsonCache.js', () => ({ getCachedJson, setCachedJson }));

// Retry delays are real setTimeouts inside withRetry; keep them out of the test clock.
vi.mock('../search/searchRetryStrategy.js', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../search/searchRetryStrategy.js')>();
  return {
    ...mod,
    withRetry: (
      fn: () => Promise<unknown>,
      opts: { maxRetries: number; isRecoverable?: (e: Error) => boolean }
    ) => mod.withRetry(fn, { ...opts, delayMs: 0 }),
  };
});

const { DeepLService, DeepLError, baseUrlForKey, parseTsvEntries, buildTsvEntries, rootLang } =
  await import('./DeepLService.js');

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

const ok = (body: unknown, headers: Record<string, string> = {}) => ({
  ok: true,
  status: 200,
  statusText: 'OK',
  headers: new Headers(headers),
  json: async () => body,
  arrayBuffer: async () => new TextEncoder().encode('binary').buffer,
});

const fail = (status: number, body: unknown, headers: Record<string, string> = {}) => ({
  ok: false,
  status,
  statusText: `Status ${status}`,
  headers: new Headers(headers),
  json: async () => body,
});

const TRANSLATED = {
  translations: [{ detected_source_language: 'EN', text: 'Hallo Welt', billed_characters: 11 }],
};

let service: InstanceType<typeof DeepLService>;

beforeEach(() => {
  fetchMock.mockReset();
  warn.mockReset();
  getCachedJson.mockReset().mockResolvedValue(null);
  setCachedJson.mockReset().mockResolvedValue(undefined);
  service = new DeepLService('pro-key');
  service._resetForTests();
});

describe('baseUrlForKey', () => {
  it('routes free keys (":fx") to api-free.deepl.com and everything else to api.deepl.com', () => {
    expect(baseUrlForKey('abc:fx')).toBe('https://api-free.deepl.com');
    expect(baseUrlForKey('abc')).toBe('https://api.deepl.com');
    expect(new DeepLService('abc:fx').baseUrl).toBe('https://api-free.deepl.com');
  });
});

describe('translateText', () => {
  it('sends the documented request shape and normalises the response', async () => {
    fetchMock.mockResolvedValue(ok(TRANSLATED));

    const result = await service.translateText({
      text: ['Hello world'],
      targetLang: 'de',
      sourceLang: 'en',
      formality: 'more',
      glossaryId: 'g-1',
    });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.deepl.com/v2/translate');
    expect((init.headers as Record<string, string>).Authorization).toBe('DeepL-Auth-Key pro-key');
    expect(JSON.parse(init.body as string)).toEqual({
      text: ['Hello world'],
      target_lang: 'de',
      source_lang: 'en',
      formality: 'more',
      glossary_id: 'g-1',
      show_billed_characters: true,
    });
    expect(result).toEqual([
      { text: 'Hallo Welt', detectedSourceLang: 'en', billedCharacters: 11 },
    ]);
  });

  it('omits source_lang and formality=default so DeepL auto-detects', async () => {
    fetchMock.mockResolvedValue(ok(TRANSLATED));
    await service.translateText({ text: ['x'], targetLang: 'de', formality: 'default' });
    const body = JSON.parse((fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string);
    expect(body).not.toHaveProperty('source_lang');
    expect(body).not.toHaveProperty('formality');
  });

  it('retries a 429 and succeeds on the next attempt', async () => {
    fetchMock
      .mockResolvedValueOnce(fail(429, { message: 'Too many requests' }))
      .mockResolvedValueOnce(ok(TRANSLATED));

    const result = await service.translateText({ text: ['x'], targetLang: 'de' });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result[0]?.text).toBe('Hallo Welt');
  });

  it('never retries 456 (quota) and parks the service afterwards', async () => {
    fetchMock.mockResolvedValue(
      fail(456, { message: 'Quota for this billing period has been exceeded.' })
    );

    await expect(service.translateText({ text: ['x'], targetLang: 'de' })).rejects.toMatchObject({
      name: 'DeepLError',
      status: 456,
      quotaExhausted: true,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // The next call does not even reach the network.
    await expect(service.translateText({ text: ['y'], targetLang: 'de' })).rejects.toMatchObject({
      status: 456,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('never retries a 400 and logs the X-Trace-ID', async () => {
    fetchMock.mockResolvedValue(
      fail(400, { message: "Value for 'target_lang' not supported." }, { 'x-trace-id': 'trace-42' })
    );

    await expect(service.translateText({ text: ['x'], targetLang: 'xx' })).rejects.toBeInstanceOf(
      DeepLError
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('trace-42'));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("target_lang' not supported"));
  });

  it('reads the edge error shape ({error:{message}}) too', async () => {
    fetchMock.mockResolvedValue(fail(502, { error: { message: 'Bad Gateway.' } }));
    await expect(service.translateText({ text: ['x'], targetLang: 'de' })).rejects.toMatchObject({
      message: 'DeepL 502: Bad Gateway.',
    });
  });
});

describe('getLanguages', () => {
  const RAW = [
    {
      lang: 'de',
      name: 'German',
      usable_as_source: true,
      usable_as_target: true,
      features: { formality: { status: 'stable' }, glossary: { status: 'stable' } },
    },
    {
      lang: 'en-GB',
      name: 'English (British)',
      usable_as_source: false,
      usable_as_target: true,
      features: {},
    },
  ];

  it('fetches, normalises the feature flags and caches for an hour', async () => {
    fetchMock.mockResolvedValue(ok(RAW));

    const languages = await service.getLanguages();

    expect((fetchMock.mock.calls[0] as [string])[0]).toBe(
      'https://api.deepl.com/v3/languages?resource=translate_text'
    );
    expect(languages).toEqual([
      {
        code: 'de',
        name: 'German',
        usableAsSource: true,
        usableAsTarget: true,
        formality: true,
        glossary: true,
      },
      {
        code: 'en-GB',
        name: 'English (British)',
        usableAsSource: false,
        usableAsTarget: true,
        formality: false,
        glossary: false,
      },
    ]);
    expect(setCachedJson).toHaveBeenCalledWith('deepl:languages:v1', languages, 3600);
  });

  it('serves the cache without touching the network', async () => {
    getCachedJson.mockResolvedValueOnce([
      {
        code: 'de',
        name: 'German',
        usableAsSource: true,
        usableAsTarget: true,
        formality: true,
        glossary: true,
      },
    ]);
    const languages = await service.getLanguages();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(languages).toHaveLength(1);
  });

  it('falls back to the stale copy when DeepL is down', async () => {
    getCachedJson
      .mockResolvedValueOnce(null) // fresh
      .mockResolvedValueOnce([
        {
          code: 'fr',
          name: 'French',
          usableAsSource: true,
          usableAsTarget: true,
          formality: true,
          glossary: true,
        },
      ]); // stale
    fetchMock.mockResolvedValue(fail(503, { message: 'down' }));

    const languages = await service.getLanguages();
    expect(languages[0]?.code).toBe('fr');
  });
});

describe('documents', () => {
  it('uploads as multipart with the original filename and the documented fields', async () => {
    fetchMock.mockResolvedValue(ok({ document_id: 'doc-1', document_key: 'key-1' }));

    const handle = await service.uploadDocument({
      buffer: Buffer.from('hello'),
      filename: 'Rede.docx',
      targetLang: 'en-GB',
      sourceLang: 'de',
      formality: 'less',
      glossaryId: 'g-1',
      outputFormat: null,
    });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.deepl.com/v2/document');
    const form = init.body as FormData;
    expect(form).toBeInstanceOf(FormData);
    expect(form.get('target_lang')).toBe('en-GB');
    expect(form.get('source_lang')).toBe('de');
    expect(form.get('formality')).toBe('less');
    expect(form.get('glossary_id')).toBe('g-1');
    expect(form.has('output_format')).toBe(false);
    expect((form.get('file') as File).name).toBe('Rede.docx');
    expect((init.headers as Record<string, string>)['Content-Type']).toBeUndefined();
    expect(handle).toEqual({ documentId: 'doc-1', documentKey: 'key-1' });
  });

  it('maps the status response including the error message', async () => {
    fetchMock.mockResolvedValue(
      ok({ status: 'error', error_message: 'Source and target language are equal.' })
    );
    const state = await service.getDocumentStatus({ documentId: 'doc-1', documentKey: 'key-1' });
    expect(state).toEqual({
      status: 'error',
      secondsRemaining: null,
      billedCharacters: null,
      message: 'Source and target language are equal.',
    });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.deepl.com/v2/document/doc-1');
    expect(JSON.parse(init.body as string)).toEqual({ document_key: 'key-1' });
  });

  it('does NOT retry the one-shot result download even on a retryable status', async () => {
    fetchMock.mockResolvedValue(fail(503, { message: 'down' }));

    await expect(
      service.downloadDocument({ documentId: 'doc-1', documentKey: 'key-1' })
    ).rejects.toMatchObject({ status: 503 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('returns the binary and content type on success', async () => {
    fetchMock.mockResolvedValue(
      ok(null, {
        'content-type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      })
    );
    const result = await service.downloadDocument({ documentId: 'doc-1', documentKey: 'key-1' });
    expect(result.buffer.toString()).toBe('binary');
    expect(result.contentType).toContain('wordprocessingml');
  });
});

describe('glossaries', () => {
  it('parses the list, lower-casing dictionary languages', async () => {
    fetchMock.mockResolvedValue(
      ok({
        glossaries: [
          {
            glossary_id: 'g-1',
            name: 'Grünerator',
            dictionaries: [{ source_lang: 'DE', target_lang: 'EN', entry_count: 3 }],
            creation_time: '2026-09-15T10:00:00Z',
          },
        ],
      })
    );
    const list = await service.listGlossaries();
    expect(list).toEqual([
      {
        glossaryId: 'g-1',
        name: 'Grünerator',
        dictionaries: [{ sourceLang: 'de', targetLang: 'en', entryCount: 3 }],
        creationTime: '2026-09-15T10:00:00Z',
      },
    ]);
  });

  it('replaces a dictionary as TSV via PUT', async () => {
    fetchMock.mockResolvedValue(ok({ source_lang: 'de', target_lang: 'en', entry_count: 1 }));
    await service.replaceDictionary('g-1', { sourceLang: 'de', targetLang: 'en' }, [
      { source: 'Bündnis 90/Die Grünen', target: 'Alliance 90/The Greens' },
    ]);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.deepl.com/v3/glossaries/g-1/dictionaries');
    expect(init.method).toBe('PUT');
    expect(JSON.parse(init.body as string)).toEqual({
      source_lang: 'de',
      target_lang: 'en',
      entries: 'Bündnis 90/Die Grünen\tAlliance 90/The Greens',
      entries_format: 'tsv',
    });
  });

  it('reads dictionary entries from the TSV payload', async () => {
    fetchMock.mockResolvedValue(
      ok({
        dictionaries: [
          {
            source_lang: 'de',
            target_lang: 'en',
            entries: 'Hallo\tHello\nWelt\tWorld\n',
            entries_format: 'tsv',
          },
        ],
      })
    );
    const entries = await service.getDictionaryEntries('g-1', {
      sourceLang: 'de',
      targetLang: 'en',
    });
    expect((fetchMock.mock.calls[0] as [string])[0]).toBe(
      'https://api.deepl.com/v3/glossaries/g-1/entries?source_lang=de&target_lang=en'
    );
    expect(entries).toEqual([
      { source: 'Hallo', target: 'Hello' },
      { source: 'Welt', target: 'World' },
    ]);
  });
});

describe('helpers', () => {
  it('round-trips TSV and skips malformed lines', () => {
    expect(parseTsvEntries('a\tb\n\nnotab\n c \t d ')).toEqual([
      { source: 'a', target: 'b' },
      { source: 'c', target: 'd' },
    ]);
    expect(
      buildTsvEntries([
        { source: 'a', target: 'b' },
        { source: 'c', target: 'd' },
      ])
    ).toBe('a\tb\nc\td');
  });

  it('reduces regional codes to their root', () => {
    expect(rootLang('EN-GB')).toBe('en');
    expect(rootLang('de')).toBe('de');
  });
});
