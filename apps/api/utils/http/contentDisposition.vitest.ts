import { describe, it, expect, vi } from 'vitest';

import { buildContentDisposition, setContentDisposition } from './contentDisposition.js';

import type { Response } from 'express';

describe('buildContentDisposition', () => {
  it('passes through pure ASCII filenames in both params', () => {
    expect(buildContentDisposition('report.pdf')).toBe(
      `attachment; filename="report.pdf"; filename*=UTF-8''report.pdf`
    );
  });

  it('sanitizes German Umlauts in the ASCII fallback and percent-encodes them in filename*', () => {
    const header = buildContentDisposition('Grüße aus Wien.md');
    expect(header).toBe(
      `attachment; filename="Gr__e aus Wien.md"; filename*=UTF-8''Gr%C3%BC%C3%9Fe%20aus%20Wien.md`
    );
  });

  it('strips control characters that would crash res.setHeader', () => {
    const header = buildContentDisposition('foo\r\nbar.txt');
    expect(header).not.toMatch(/[\r\n]/);
    expect(header).toContain('filename="foobar.txt"');
  });

  it('escapes double-quote and backslash in the ASCII fallback', () => {
    const header = buildContentDisposition('weird"name\\.pdf');
    expect(header).toContain('filename="weird_name_.pdf"');
  });

  it('falls back to "download" when sanitization empties the string', () => {
    expect(buildContentDisposition('\x00\x01\x02')).toContain('filename="download"');
  });

  it('encodes the RFC 5987 attr-char gaps that encodeURIComponent misses', () => {
    const header = buildContentDisposition(`a'b(c)d*e.txt`);
    expect(header).toContain(`filename*=UTF-8''a%27b%28c%29d%2Ae.txt`);
  });

  it('supports inline disposition', () => {
    expect(buildContentDisposition('speech.wav', 'inline')).toBe(
      `inline; filename="speech.wav"; filename*=UTF-8''speech.wav`
    );
  });

  it('produces a header value that Node will accept via setHeader', () => {
    const res = { setHeader: vi.fn() } as unknown as Response;
    setContentDisposition(res, 'Müll & Späße.json');
    const [name, value] = vi.mocked(res.setHeader).mock.calls[0];
    expect(name).toBe('Content-Disposition');
    expect(value).toMatch(/^[\x20-\x7E]+$/);
  });
});
