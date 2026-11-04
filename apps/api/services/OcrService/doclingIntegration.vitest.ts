/**
 * Tests for the GreenPT-hosted Docling integration.
 *
 * Verifies:
 * - Request shape: Bearer auth, flat multipart option fields
 * - Response parsing across the shapes the API can answer with
 * - Error paths: missing key, HTTP failure, and the 200-with-`errors` case
 *
 * Run with: pnpm --filter @gruenerator/api test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import {
  compactMarkdownTables,
  extractBase64WithDocling,
  extractPagesWithDocling,
  isDoclingAvailable,
  pageRuns,
  GREENPT_DOCUMENTS_URL,
} from './doclingIntegration.js';

const PDF_BASE64 = Buffer.from('fake-pdf-bytes').toString('base64');

const mockFetch = vi.fn();
const originalKey = process.env.GREENPT_API_KEY;

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(typeof body === 'string' ? body : JSON.stringify(body)),
  } as unknown as Response;
}

beforeEach(() => {
  mockFetch.mockReset();
  vi.stubGlobal('fetch', mockFetch);
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  process.env.GREENPT_API_KEY = 'test-key';
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  if (originalKey === undefined) {
    delete process.env.GREENPT_API_KEY;
  } else {
    process.env.GREENPT_API_KEY = originalKey;
  }
});

describe('extractBase64WithDocling', () => {
  it('posts to the GreenPT documents endpoint with a bearer token', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ document: { md_content: '# Titel' } }));

    await extractBase64WithDocling(PDF_BASE64, 'doc.pdf');

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(GREENPT_DOCUMENTS_URL);
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer test-key');
  });

  it('sends the conversion options as flat multipart fields, not a parameters blob', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ document: { md_content: '# Titel' } }));

    await extractBase64WithDocling(PDF_BASE64, 'doc.pdf');

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const form = init.body as FormData;
    expect(form.get('to_formats')).toBe('md');
    expect(form.get('image_export_mode')).toBe('placeholder');
    expect(form.get('do_ocr')).toBe('true');
    expect(form.get('force_ocr')).toBe('false');
    expect(form.get('do_table_structure')).toBe('true');
    expect(form.get('table_mode')).toBe('accurate');
    expect(form.get('parameters')).toBeNull();
    expect((form.get('files') as File).name).toBe('doc.pdf');
  });

  it('returns the markdown from a single-document response', async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({ document: { md_content: '# Titel\n\nText' }, status: 'completed' })
    );

    const result = await extractBase64WithDocling(PDF_BASE64, 'doc.pdf');

    expect(result.text).toBe('# Titel\n\nText');
    expect(result.method).toBe('docling');
    expect(result.stats?.method).toBe('greenpt-docling');
  });

  it('joins a multi-document response with a separator', async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({ documents: [{ md_content: 'eins' }, { md_content: 'zwei' }] })
    );

    const result = await extractBase64WithDocling(PDF_BASE64, 'doc.pdf');

    expect(result.text).toBe('eins\n\n---\n\nzwei');
    expect(result.pageCount).toBe(2);
  });

  it('falls back through the alternative markdown field names', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ document: { text: 'nur text' } }));

    const result = await extractBase64WithDocling(PDF_BASE64, 'doc.pdf');

    expect(result.text).toBe('nur text');
  });

  it('throws before the request when the API key is missing', async () => {
    delete process.env.GREENPT_API_KEY;

    await expect(extractBase64WithDocling(PDF_BASE64, 'doc.pdf')).rejects.toThrow(
      'GREENPT_API_KEY is not configured'
    );
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('surfaces the HTTP status of a failed request', async () => {
    mockFetch.mockResolvedValue(jsonResponse('Unauthorized', 401));

    await expect(extractBase64WithDocling(PDF_BASE64, 'doc.pdf')).rejects.toThrow(
      /GreenPT documents API returned 401/
    );
  });

  it('reports the upstream errors array when a 200 carries no text', async () => {
    // The API answers 200 with a populated `errors` array for a document it
    // could not parse — without reading it, that arrives as an empty document.
    mockFetch.mockResolvedValue(
      jsonResponse({
        document: { md_content: '' },
        status: 'failure',
        errors: [{ error_message: 'PDFium: Data format error' }],
      })
    );

    await expect(extractBase64WithDocling(PDF_BASE64, 'doc.pdf')).rejects.toThrow(
      /status=failure.*PDFium: Data format error/s
    );
  });
});

describe('isDoclingAvailable', () => {
  it('is true when the key is configured and false when it is not', async () => {
    await expect(isDoclingAvailable()).resolves.toBe(true);

    delete process.env.GREENPT_API_KEY;
    await expect(isDoclingAvailable()).resolves.toBe(false);
  });
});

describe('pageRuns', () => {
  it('fasst aufeinanderfolgende Seiten zusammen und sortiert', () => {
    expect(pageRuns([16, 18, 23, 24, 25, 16])).toEqual([[16], [18], [23, 24, 25]]);
  });

  it('teilt lange Läufe nach 25 Seiten', () => {
    const runs = pageRuns(Array.from({ length: 60 }, (_, i) => i + 1));
    expect(runs.map((r) => r.length)).toEqual([25, 25, 10]);
    expect(runs[1][0]).toBe(26);
  });
});

describe('compactMarkdownTables', () => {
  it('entfernt das Auffüllen der Zellen und vereinheitlicht die Trennzeile', () => {
    const md = [
      'Text davor   bleibt',
      '| Delikt          |   2024 | 2025 |',
      '|-----------------|-------:|------|',
      '| Betrug          |    205 |  155 |',
    ].join('\n');
    expect(compactMarkdownTables(md)).toBe(
      [
        'Text davor   bleibt',
        '| Delikt | 2024 | 2025 |',
        '| --- | --- | --- |',
        '| Betrug | 205 | 155 |',
      ].join('\n')
    );
  });
});

describe('extractPagesWithDocling', () => {
  const PAGE_BREAK = '<!-- gruenerator-page-break -->';
  const md = (...pages: string[]) =>
    jsonResponse({ document: { md_content: pages.join(PAGE_BREAK) } });

  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  async function run(pages: number[]) {
    const pending = extractPagesWithDocling(Buffer.from('pdf'), 'S19-1.pdf', pages);
    await vi.runAllTimersAsync();
    return pending;
  }

  it('schickt je Lauf einen page_range mit Seitenumbruch-Marke und ordnet die Teile den Seiten zu', async () => {
    mockFetch
      .mockResolvedValueOnce(md('Seite drei', '| a   | b |'))
      .mockResolvedValueOnce(md('Seite sieben'));

    const byPage = await run([3, 4, 7]);

    expect(mockFetch).toHaveBeenCalledTimes(2);
    const form = (mockFetch.mock.calls[0][1] as RequestInit).body as FormData;
    expect(form.getAll('page_range')).toEqual(['3', '4']);
    expect(form.get('md_page_break_placeholder')).toBe(PAGE_BREAK);
    expect(
      ((mockFetch.mock.calls[1][1] as RequestInit).body as FormData).getAll('page_range')
    ).toEqual(['7', '7']);
    expect([...byPage]).toEqual([
      [3, 'Seite drei'],
      [4, '| a | b |'],
      [7, 'Seite sieben'],
    ]);
  });

  it('verwirft einen Lauf, dessen Teile nicht zur Seitenzahl passen', async () => {
    mockFetch.mockResolvedValueOnce(md('nur ein Teil für zwei Seiten'));
    const byPage = await run([3, 4]);
    expect(byPage.size).toBe(0);
  });

  it('wartet bei 429 und versucht es erneut, statt aufzugeben', async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse('Too Many Requests', 429))
      .mockResolvedValueOnce(md('Seite eins'));
    const byPage = await run([1]);
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(byPage.get(1)).toBe('Seite eins');
  });

  it('wirft bei anderen Fehlern, damit der Aufrufer den pdfjs-Text behält', async () => {
    mockFetch.mockResolvedValue(jsonResponse('boom', 500));
    const pending = extractPagesWithDocling(Buffer.from('pdf'), 'S19-1.pdf', [1]);
    const assertion = expect(pending).rejects.toThrow(/500/);
    await vi.runAllTimersAsync();
    await assertion;
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});
