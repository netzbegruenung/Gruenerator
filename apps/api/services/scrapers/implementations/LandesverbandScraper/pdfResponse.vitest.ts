/**
 * Das PDF-Archiv der MV-Grünen verlinkt Landingpages des WordPress Download
 * Managers, keine PDFs. Bis hierher ging deren HTML-Quelltext direkt an den
 * OcrService und landete als Beschlusstext im Index (#3577).
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it, vi } from 'vitest';

import { fetchPdfDocument, isPdfBytes, resolveDownloadUrl } from './pdfResponse.js';

const FIXTURES = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'extractors',
  '__fixtures__'
);
const LANDING_URL = 'https://gruene-mv.de/download/protokoll-der-ldk-guestrow-12-oktober-2024/';
const LANDING_HTML = readFileSync(path.join(FIXTURES, 'gruene-mv-wpdm-landing.html'), 'utf8');
const PDF_BYTES = Buffer.from('%PDF-1.7\n%âãÏÓ\n1 0 obj\n<<>>\nendobj\n');

describe('isPdfBytes', () => {
  it('accepts bytes that start with the %PDF magic', () => {
    expect(isPdfBytes(PDF_BYTES)).toBe(true);
  });

  it('rejects HTML bytes', () => {
    expect(isPdfBytes(Buffer.from(LANDING_HTML))).toBe(false);
  });

  it('rejects empty bytes', () => {
    expect(isPdfBytes(Buffer.alloc(0))).toBe(false);
  });
});

describe('resolveDownloadUrl', () => {
  it('reads the file URL from a WPDM landing page, keeping wpdmdl and dropping refresh', () => {
    expect(resolveDownloadUrl(LANDING_HTML, LANDING_URL)).toEqual({
      url: 'https://gruene-mv.de/download/protokoll-der-ldk-guestrow-12-oktober-2024/?wpdmdl=29195',
      title: 'Protokoll der LDK Güstrow 12. Oktober 2024',
    });
  });

  it('returns null for a page without a download link', () => {
    expect(
      resolveDownloadUrl('<html><body><h1>Beschlüsse</h1></body></html>', LANDING_URL)
    ).toBeNull();
  });

  it('ignores a download link that points to another host', () => {
    const html = '<a data-downloadurl="https://evil.example/x/?wpdmdl=1&refresh=abc">Download</a>';
    expect(resolveDownloadUrl(html, LANDING_URL)).toBeNull();
  });

  it('ignores a download link without a wpdmdl id', () => {
    const html = '<a data-downloadurl="https://gruene-mv.de/download/x/?refresh=abc">Download</a>';
    expect(resolveDownloadUrl(html, LANDING_URL)).toBeNull();
  });
});

function response(
  body: string | Buffer,
  init: { status?: number; headers?: Record<string, string> } = {}
): Response {
  return new Response(init.status === 304 ? null : new Uint8Array(Buffer.from(body)), {
    status: init.status ?? 200,
    headers: init.headers,
  });
}

describe('fetchPdfDocument', () => {
  it('passes a real PDF straight through with its own validators', async () => {
    const fetchUrl = vi
      .fn()
      .mockResolvedValue(
        response(PDF_BYTES, { headers: { 'content-type': 'application/pdf', etag: '"f1"' } })
      );

    const result = await fetchPdfDocument('https://x.de/a.pdf', {}, fetchUrl);

    expect(result.kind).toBe('pdf');
    if (result.kind !== 'pdf') return;
    expect(result.bytes.equals(PDF_BYTES)).toBe(true);
    expect(result.response.headers.get('etag')).toBe('"f1"');
    expect(result.landingTitle).toBeNull();
    expect(fetchUrl).toHaveBeenCalledTimes(1);
  });

  it('reports a 304 without downloading anything else', async () => {
    const fetchUrl = vi.fn().mockResolvedValue(response('', { status: 304 }));

    const result = await fetchPdfDocument(
      'https://x.de/a.pdf',
      { 'If-None-Match': '"f1"' },
      fetchUrl
    );

    expect(result).toEqual({ kind: 'not_modified' });
    expect(fetchUrl).toHaveBeenCalledWith('https://x.de/a.pdf', {
      headers: { 'If-None-Match': '"f1"' },
      acceptStatus: [304],
    });
  });

  it('follows a WPDM landing page to the file and fingerprints the file, not the page', async () => {
    const fetchUrl = vi
      .fn()
      .mockResolvedValueOnce(
        response(LANDING_HTML, {
          headers: {
            'content-type': 'text/html; charset=UTF-8',
            etag: '"landing-changes-every-request"',
            'last-modified': 'Wed, 23 Sep 2026 11:59:34 GMT',
          },
        })
      )
      .mockResolvedValueOnce(
        response(PDF_BYTES, {
          headers: {
            'content-type': 'application/pdf',
            'last-modified': 'Thu, 15 May 2025 08:00:00 GMT',
          },
        })
      );

    const result = await fetchPdfDocument(LANDING_URL, {}, fetchUrl);

    expect(result.kind).toBe('pdf');
    if (result.kind !== 'pdf') return;
    expect(result.bytes.equals(PDF_BYTES)).toBe(true);
    expect(result.response.headers.get('etag')).toBeNull();
    expect(result.response.headers.get('last-modified')).toBe('Thu, 15 May 2025 08:00:00 GMT');
    expect(result.landingTitle).toBe('Protokoll der LDK Güstrow 12. Oktober 2024');
    expect(fetchUrl).toHaveBeenLastCalledWith(
      'https://gruene-mv.de/download/protokoll-der-ldk-guestrow-12-oktober-2024/?wpdmdl=29195',
      { headers: {}, acceptStatus: [304] }
    );
  });

  /**
   * Die zwölf MV-Punkte tragen die Validatoren der Landingpage. Ihr
   * `If-Modified-Since` (Abrufzeit) liegt nach dem Datum der Datei — die
   * Datei-URL antwortete darauf mit 304 und der HTML-Punkt bliebe für immer.
   */
  it('sends no conditional headers for a URL that does not end in .pdf', async () => {
    const stale = {
      'If-None-Match': '"landing"',
      'If-Modified-Since': 'Mon, 22 Sep 2026 11:23:12 GMT',
    };
    const fetchUrl = vi
      .fn()
      .mockResolvedValueOnce(response(LANDING_HTML, { headers: { 'content-type': 'text/html' } }))
      .mockResolvedValueOnce(
        response(PDF_BYTES, { headers: { 'content-type': 'application/pdf' } })
      );

    await fetchPdfDocument(LANDING_URL, stale, fetchUrl);

    expect(fetchUrl.mock.calls.map(([, options]) => options)).toEqual([
      { headers: {}, acceptStatus: [304] },
      { headers: {}, acceptStatus: [304] },
    ]);
  });

  it('keeps conditional headers for a .pdf URL, whatever its case', async () => {
    const fetchUrl = vi.fn().mockResolvedValue(response('', { status: 304 }));

    await fetchPdfDocument(
      'https://x.de/uploads/Beschluss.PDF',
      { 'If-None-Match': '"f1"' },
      fetchUrl
    );

    expect(fetchUrl).toHaveBeenCalledWith('https://x.de/uploads/Beschluss.PDF', {
      headers: { 'If-None-Match': '"f1"' },
      acceptStatus: [304],
    });
  });

  // Die gespeicherten Validatoren gehören zur ursprünglichen URL, nie zur
  // aufgelösten Datei — auch wenn eine frühere .pdf-URL zur Landingpage wird.
  it('never sends the stored validators to the resolved file', async () => {
    const fetchUrl = vi
      .fn()
      .mockResolvedValueOnce(response(LANDING_HTML, { headers: { 'content-type': 'text/html' } }))
      .mockResolvedValueOnce(
        response(PDF_BYTES, { headers: { 'content-type': 'application/pdf' } })
      );

    await fetchPdfDocument(
      'https://gruene-mv.de/uploads/beschluss.pdf',
      { 'If-None-Match': '"old-pdf"' },
      fetchUrl
    );

    expect(fetchUrl.mock.calls.map(([, options]) => options)).toEqual([
      { headers: { 'If-None-Match': '"old-pdf"' }, acceptStatus: [304] },
      { headers: {}, acceptStatus: [304] },
    ]);
  });

  it('reports a 304 of the resolved file as not modified', async () => {
    const fetchUrl = vi
      .fn()
      .mockResolvedValueOnce(response(LANDING_HTML, { headers: { 'content-type': 'text/html' } }))
      .mockResolvedValueOnce(response('', { status: 304 }));

    await expect(fetchPdfDocument(LANDING_URL, {}, fetchUrl)).resolves.toEqual({
      kind: 'not_modified',
    });
  });

  it('refuses HTML without a download link, even when it claims to be a PDF', async () => {
    const fetchUrl = vi.fn().mockResolvedValue(
      response('<!doctype html><html><body>Fehler</body></html>', {
        headers: { 'content-type': 'application/pdf' },
      })
    );

    await expect(fetchPdfDocument('https://x.de/a.pdf', {}, fetchUrl)).resolves.toEqual({
      kind: 'not_pdf',
    });
    expect(fetchUrl).toHaveBeenCalledTimes(1);
  });

  it('refuses when the resolved download is not a PDF either', async () => {
    const fetchUrl = vi
      .fn()
      .mockResolvedValueOnce(response(LANDING_HTML, { headers: { 'content-type': 'text/html' } }))
      .mockResolvedValueOnce(response(LANDING_HTML, { headers: { 'content-type': 'text/html' } }));

    await expect(fetchPdfDocument(LANDING_URL, {}, fetchUrl)).resolves.toEqual({
      kind: 'not_pdf',
    });
    expect(fetchUrl).toHaveBeenCalledTimes(2);
  });
});
