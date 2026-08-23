import { describe, expect, it } from 'vitest';

import {
  isSafeDownloadFilename,
  parseWebViewMessage,
  sanitizeDownloadFilename,
  WEBVIEW_DOWNLOAD_MAX_BASE64_LENGTH,
  type WebViewOutboundMessage,
} from './webviewBridge.js';

/** A well-formed DOWNLOAD_FILE, so each case below varies exactly one thing. */
const download = (over: Partial<Record<string, unknown>> = {}): Record<string, unknown> => ({
  type: 'DOWNLOAD_FILE',
  filename: 'gruenerator-seite-1.png',
  mime: 'image/png',
  data: 'aGVsbG8=',
  ...over,
});

describe('parseWebViewMessage', () => {
  it('accepts the two payload-less messages as JSON strings', () => {
    expect(parseWebViewMessage(JSON.stringify({ type: 'CLOSE' }))).toEqual({ type: 'CLOSE' });
    expect(parseWebViewMessage(JSON.stringify({ type: 'SESSION_LOST' }))).toEqual({
      type: 'SESSION_LOST',
    });
  });

  it('accepts already-parsed objects', () => {
    expect(parseWebViewMessage({ type: 'CLOSE' })).toEqual({ type: 'CLOSE' });
  });

  it('drops unknown extra fields rather than passing them through', () => {
    // The host must never forward page-supplied data it did not ask for.
    expect(parseWebViewMessage({ type: 'CLOSE', payload: { evil: true } })).toEqual({
      type: 'CLOSE',
    });
  });

  it.each([
    ['not json at all', 'unparseable string'],
    ['{"type":"NAVIGATE","url":"https://evil.com"}', 'unknown message type'],
    ['{"type":123}', 'non-string type'],
    ['null', 'json null'],
    ['[]', 'json array is not an object with a type'],
  ])('rejects %j — %s', (input) => {
    expect(parseWebViewMessage(input)).toBeNull();
  });

  it.each([[null], [undefined], [42], [{}], [{ type: undefined }]])(
    'rejects the non-message value %j',
    (input) => {
      expect(parseWebViewMessage(input)).toBeNull();
    }
  );
});

describe('parseWebViewMessage — DOWNLOAD_FILE', () => {
  it('accepts a well-formed payload and narrows to it', () => {
    const parsed = parseWebViewMessage(JSON.stringify(download()));
    expect(parsed).toEqual({
      type: 'DOWNLOAD_FILE',
      filename: 'gruenerator-seite-1.png',
      mime: 'image/png',
      data: 'aGVsbG8=',
    });
    // Compile-time half of the same claim: the union member carries its fields.
    const message = parsed as Extract<WebViewOutboundMessage, { type: 'DOWNLOAD_FILE' }>;
    expect(message.filename).toBe('gruenerator-seite-1.png');
  });

  it('drops extra fields on the payload message too', () => {
    // The twin of the CLOSE case above: reconstruction, not pass-through, is
    // what keeps a page from smuggling a field into host code.
    expect(parseWebViewMessage(download({ cwd: '/etc', evil: true }))).toEqual({
      type: 'DOWNLOAD_FILE',
      filename: 'gruenerator-seite-1.png',
      mime: 'image/png',
      data: 'aGVsbG8=',
    });
  });

  it('keeps spaces in a filename', () => {
    // Real export names carry them — `Haushalt 2027.pptx` from the presentation
    // export. A stricter rule would reject the very files this path exists for.
    const parsed = parseWebViewMessage(download({ filename: 'Haushalt 2027.pptx' }));
    expect(parsed).not.toBeNull();
  });

  it.each([
    ['../../../../Documents/evil.png', 'parent-directory traversal'],
    ['a/b.csv', 'a path, not a base name'],
    ['a\\b.csv', 'a Windows path separator'],
    ['..', 'the parent directory itself'],
    ['.', 'the current directory'],
    ['', 'empty'],
    ['x'.repeat(256), 'longer than any filesystem accepts'],
  ])('rejects the filename %j — %s', (filename) => {
    // The filename becomes a path on the host (`new File(Paths.cache, …)`), so
    // a navigated or injected page must not be able to steer where bytes land.
    expect(parseWebViewMessage(download({ filename }))).toBeNull();
  });

  it('rejects a filename carrying a control character', () => {
    // A NUL truncates the path in several native APIs, so `evil.png\u0000.txt`
    // would be written as `evil.png`.
    expect(parseWebViewMessage(download({ filename: 'evil.png\u0000.txt' }))).toBeNull();
    expect(parseWebViewMessage(download({ filename: 'two\nlines.png' }))).toBeNull();
  });

  it.each([
    [{ filename: 42 }, 'non-string filename'],
    [{ mime: '' }, 'empty mime'],
    [{ mime: null }, 'missing mime'],
    [{ data: '' }, 'empty data'],
    [{ data: 42 }, 'non-string data'],
  ])('rejects %j — %s', (over, _reason) => {
    expect(parseWebViewMessage(download(over))).toBeNull();
  });

  it('rejects a payload over the size cap', () => {
    // Oversized strings do not fail cleanly on the bridge, they stall it — so
    // the cap is a rejection here and a visible error at the sender.
    const tooBig = 'A'.repeat(WEBVIEW_DOWNLOAD_MAX_BASE64_LENGTH + 1);
    expect(parseWebViewMessage(download({ data: tooBig }))).toBeNull();
  });

  it('accepts a payload exactly at the cap', () => {
    const exact = 'A'.repeat(WEBVIEW_DOWNLOAD_MAX_BASE64_LENGTH);
    expect(parseWebViewMessage(download({ data: exact }))).not.toBeNull();
  });
});

describe('sanitizeDownloadFilename', () => {
  it('leaves an ordinary name alone', () => {
    expect(sanitizeDownloadFilename('Haushalt 2027.pptx')).toBe('Haushalt 2027.pptx');
  });

  it('turns a path separator into a dash instead of dropping it', () => {
    // The case from the review: a document titled `Protokoll 12/2026` is
    // ordinary, and its filename used to be rejected wholesale by the host —
    // silently, because posting a message is not a round trip.
    expect(sanitizeDownloadFilename('Protokoll 12/2026.docx')).toBe('Protokoll 12-2026.docx');
    expect(sanitizeDownloadFilename('An\\Aus.odt')).toBe('An-Aus.odt');
  });

  it('strips control characters', () => {
    expect(sanitizeDownloadFilename('Titel\u0007mit\u0000Steuerzeichen.csv')).toBe(
      'TitelmitSteuerzeichen.csv'
    );
  });

  it('falls back when nothing usable is left', () => {
    expect(sanitizeDownloadFilename('...')).toBe('Download');
    expect(sanitizeDownloadFilename('   ')).toBe('Download');
    expect(sanitizeDownloadFilename('/')).toBe('-');
  });

  it('keeps the extension when it has to cut', () => {
    // A `.pptx` that lost its suffix opens in nothing.
    const long = `${'a'.repeat(400)}.pptx`;
    const result = sanitizeDownloadFilename(long);
    expect(result).toHaveLength(255);
    expect(result.endsWith('.pptx')).toBe(true);
  });

  it('produces something the host actually accepts', () => {
    // The point of the whole exercise: sanitize is the caller-side repair for
    // exactly the predicate the host applies. If the two ever disagree, the
    // export fails without a visible error.
    for (const raw of [
      'Protokoll 12/2026.docx',
      'An\\Aus.odt',
      'Titel\u0007mit\u0000Steuerzeichen.csv',
      '...',
      '   ',
      `${'a'.repeat(400)}.pptx`,
      'Sitzung 12/2026.pptx',
    ]) {
      expect(isSafeDownloadFilename(sanitizeDownloadFilename(raw)), raw).toBe(true);
    }
  });
});
