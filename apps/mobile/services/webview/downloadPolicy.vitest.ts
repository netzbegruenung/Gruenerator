import { describe, expect, it } from 'vitest';

import { pickTarget, safeCacheFilename } from './downloadPolicy';

/**
 * The IO half (`receiveDownload.ts`) is not tested here: it reaches MediaLibrary,
 * Sharing and expo-file-system, none of which this lane stubs. The decisions
 * are what can be wrong, and they are pure — same split, and same reason, as
 * `navigationPolicy.ts`.
 */
describe('safeCacheFilename', () => {
  it('keeps a normal export name untouched', () => {
    expect(safeCacheFilename('gruenerator-seite-1.png')).toBe('gruenerator-seite-1.png');
    // Spaces are legitimate — the presentation export builds names from titles.
    expect(safeCacheFilename('Haushalt 2027.pptx')).toBe('Haushalt 2027.pptx');
  });

  it.each([
    ['../../../../Documents/evil.png', 'evil.png'],
    ['a/b/c.csv', 'c.csv'],
    ['..\\..\\windows.csv', 'windows.csv'],
    ['/etc/passwd', 'passwd'],
  ])('collapses %j to its base name (%s)', (raw, expected) => {
    // `shareBytesAsFile` does `new File(Paths.cache, name)` with no checking of
    // its own, so a name that crossed the bridge must not be able to steer the
    // write out of the cache directory.
    expect(safeCacheFilename(raw)).toBe(expected);
  });

  it('strips control characters', () => {
    // A NUL truncates the path in several native APIs, so this would otherwise
    // be written as `evil.png`.
    expect(safeCacheFilename('bild\u0000.png')).toBe('bild.png');
    expect(safeCacheFilename('zwei\nzeilen.png')).toBe('zweizeilen.png');
  });

  it.each([['..'], ['.'], ['...'], [''], ['   '], ['/']])(
    'falls back to a generated name for %j',
    (raw) => {
      const result = safeCacheFilename(raw);
      expect(result.startsWith('export_')).toBe(true);
      expect(result.endsWith('.bin')).toBe(true);
    }
  );

  it('unhides a dotfile rather than rejecting it', () => {
    // `.hidden` names a real file, it just hides it. Stripping the dot keeps the
    // export visible in the share sheet; only an all-dots name is nothing at all.
    expect(safeCacheFilename('.hidden')).toBe('hidden');
  });

  it('truncates an over-long name but keeps the extension', () => {
    // iOS picks the target app from the extension; losing it lands the file
    // nowhere.
    const long = `${'a'.repeat(400)}.pptx`;
    const result = safeCacheFilename(long);
    expect(result.length).toBeLessThanOrEqual(120);
    expect(result.endsWith('.pptx')).toBe(true);
  });

  it('truncates an over-long name that has no extension', () => {
    const result = safeCacheFilename('b'.repeat(400));
    expect(result.length).toBe(120);
  });

  it('uses the caller-supplied fallback extension', () => {
    expect(safeCacheFilename('..', 'zip').endsWith('.zip')).toBe(true);
  });
});

describe('pickTarget', () => {
  it.each([
    ['image/png', 'gallery'],
    ['image/jpeg', 'gallery'],
    ['image/webp', 'gallery'],
    ['IMAGE/PNG', 'gallery'],
    ['application/zip', 'share'],
    ['text/csv', 'share'],
    ['application/vnd.openxmlformats-officedocument.presentationml.presentation', 'share'],
    ['', 'share'],
  ])('sends %s to the %s', (mime, expected) => {
    expect(pickTarget(mime)).toBe(expected);
  });
});
