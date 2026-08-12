import { describe, it, expect } from 'vitest';

import { formatAttachmentSize, formatPageCount, getPdfPageCount } from './attachmentMeta';

describe('formatAttachmentSize', () => {
  it('formats bytes, KB and MB (de-DE)', () => {
    expect(formatAttachmentSize(0)).toBe('0 B');
    expect(formatAttachmentSize(512)).toBe('512 B');
    expect(formatAttachmentSize(421888)).toBe('412 KB');
    expect(formatAttachmentSize(1258291)).toBe('1,2 MB');
    expect(formatAttachmentSize(25 * 1024 * 1024)).toBe('25 MB');
  });

  it('returns empty string for invalid input', () => {
    expect(formatAttachmentSize(-1)).toBe('');
    expect(formatAttachmentSize(Number.NaN)).toBe('');
  });
});

describe('formatPageCount', () => {
  it('singular and plural', () => {
    expect(formatPageCount(1)).toBe('1 Seite');
    expect(formatPageCount(14)).toBe('14 Seiten');
  });
});

describe('getPdfPageCount', () => {
  const pdfFile = (body: string) =>
    new File([`%PDF-1.4\n${body}\n%%EOF`], 'x.pdf', { type: 'application/pdf' });

  it('counts uncompressed /Type /Page objects', async () => {
    const body = [
      '1 0 obj << /Type /Pages /Kids [2 0 R 3 0 R] /Count 2 >> endobj',
      '2 0 obj << /Type /Page /Parent 1 0 R >> endobj',
      '3 0 obj << /Type /Page /Parent 1 0 R >> endobj',
    ].join('\n');
    expect(await getPdfPageCount(pdfFile(body))).toBe(2);
  });

  it('falls back to the page tree /Count when page objects are compressed', async () => {
    const body = '1 0 obj << /Type /Pages /Count 14 >> endobj';
    expect(await getPdfPageCount(pdfFile(body))).toBe(14);
  });

  it('returns null when nothing is countable or the file is not a PDF', async () => {
    expect(await getPdfPageCount(pdfFile('stream…compressed…endstream'))).toBeNull();
    expect(await getPdfPageCount(new File(['hi'], 'x.txt', { type: 'text/plain' }))).toBeNull();
  });
});
