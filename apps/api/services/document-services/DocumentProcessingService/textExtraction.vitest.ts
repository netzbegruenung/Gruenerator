/**
 * Guardrail for the upload-format promise.
 *
 * `DOCUMENT_UPLOAD_FORMATS` in @gruenerator/contracts is what the notebook UI
 * offers in its file dialog, what the drop handler accepts and what
 * POST /documents/upload-only lets through. If `extractTextFromFile` can't
 * actually read one of those entries, the failure surfaces minutes later in a
 * background job — which is exactly how DOC/ODT/RTF ended up advertised for
 * months while silently producing unsearchable documents.
 *
 * The other half of that bug was the reverse: `.md` files arrive from the
 * browser with an empty mimetype, get widened to `application/octet-stream` by
 * the deferred pipeline, and were rejected despite being plain readable text.
 */

import os from 'os';
import path from 'path';

import { DOCUMENT_UPLOAD_FORMATS } from '@gruenerator/contracts';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const extractTextFromDocument = vi.fn();

vi.mock('../../OcrService/index.js', () => ({
  ocrService: {
    extractTextFromDocument: (...args: unknown[]) => extractTextFromDocument(...args) as unknown,
  },
}));

const { extractTextFromFile } = await import('./textExtraction.js');

const asFile = (originalname: string, mimetype: string, body = 'Beschluss A1') => ({
  buffer: Buffer.from(body),
  mimetype,
  originalname,
  size: body.length,
});

beforeEach(() => {
  extractTextFromDocument.mockReset();
  extractTextFromDocument.mockResolvedValue({ text: 'ocr-text' });
});

describe('extractTextFromFile — every advertised format is readable', () => {
  it.each(DOCUMENT_UPLOAD_FORMATS.map((f) => [f.extension, f.mimeTypes[0], f.kind] as const))(
    '%s (%s) is handled as %s',
    async (extension, mimetype, kind) => {
      const text = await extractTextFromFile(asFile(`dokument${extension}`, mimetype));

      if (kind === 'ocr') {
        expect(extractTextFromDocument).toHaveBeenCalledTimes(1);
        expect(text).toBe('ocr-text');
      } else {
        expect(extractTextFromDocument).not.toHaveBeenCalled();
        expect(text).toBe('Beschluss A1');
      }
    }
  );
});

describe('extractTextFromFile — the extension decides, not the browser mimetype', () => {
  it('reads .md handed over as application/octet-stream', async () => {
    const text = await extractTextFromFile(
      asFile('notizen.md', 'application/octet-stream', '# Titel')
    );
    expect(text).toBe('# Titel');
  });

  it('reads .pdf handed over with an empty mimetype', async () => {
    await extractTextFromFile(asFile('antrag.pdf', ''));
    expect(extractTextFromDocument).toHaveBeenCalledTimes(1);
  });

  it('still resolves by mimetype when the name carries no extension', async () => {
    const text = await extractTextFromFile(asFile('wolke-export', 'text/plain', 'Inhalt'));
    expect(text).toBe('Inhalt');
  });
});

describe('extractTextFromFile — the upload name never reaches the filesystem path', () => {
  it.each([
    '../../../../etc/passwd.pdf',
    'ordner/unterordner/bericht.pdf',
    '..\\..\\windows\\system32\\config.pdf',
  ])('writes %s inside the temp directory under a generated name', async (originalname) => {
    await extractTextFromFile(asFile(originalname, 'application/pdf'));

    const tempPath = extractTextFromDocument.mock.calls[0]?.[0] as string;
    expect(path.dirname(tempPath)).toBe(os.tmpdir());
    expect(path.basename(tempPath)).toMatch(
      /^manual_upload_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.pdf$/
    );
  });
});

describe('extractTextFromFile — formats the pipeline cannot read', () => {
  it.each([
    ['beschluss.doc', 'application/msword'],
    ['beschluss.odt', 'application/vnd.oasis.opendocument.text'],
    ['beschluss.rtf', 'application/rtf'],
    ['archiv.zip', 'application/zip'],
  ])('rejects %s with an actionable message', async (name, mimetype) => {
    await expect(extractTextFromFile(asFile(name, mimetype))).rejects.toThrow(
      /können nicht gelesen werden/
    );
    await expect(extractTextFromFile(asFile(name, mimetype))).rejects.toThrow(/PDF oder DOCX/);
  });
});
