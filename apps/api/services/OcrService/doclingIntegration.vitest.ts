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
  extractBase64WithDocling,
  isDoclingAvailable,
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
