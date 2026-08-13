/**
 * Guards the pair of lists that decide whether a Wolke share file reaches OCR
 * with a media type Mistral accepts.
 *
 * The two drifted apart once already: `.doc` sat in the extension allowlist while
 * `getMediaType` knew only `.docx`/`.pptx`, so every legacy Word file went out as
 * application/octet-stream, came back HTTP 400 (code 3051), and was counted as a
 * scrape error on every full crawl — silently, because the error path only logs
 * and increments a counter.
 */
import { describe, expect, it } from 'vitest';

import { getMediaType } from '../../OcrService/validation.js';
import { OCR_EXTENSIONS, TEXT_EXTENSIONS } from './wolkeShareHandler.js';

describe('Wolke share extensions vs. OCR media types', () => {
  it('maps every OCR extension to a real media type', () => {
    const unmapped = OCR_EXTENSIONS.filter(
      (ext) => getMediaType(ext) === 'application/octet-stream'
    );
    expect(unmapped).toEqual([]);
  });

  it('keeps the text and OCR lists disjoint', () => {
    expect(OCR_EXTENSIONS.filter((ext) => TEXT_EXTENSIONS.includes(ext))).toEqual([]);
  });

  it('sends legacy Office formats under their pre-OOXML media types', () => {
    expect(getMediaType('.doc')).toBe('application/msword');
    expect(getMediaType('.DOC')).toBe('application/msword');
  });

  it('maps xlsx to the spreadsheet media type', () => {
    expect(getMediaType('.xlsx')).toBe(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
  });

  it('still falls back to octet-stream for genuinely unknown extensions', () => {
    expect(getMediaType('.zip')).toBe('application/octet-stream');
    expect(getMediaType('')).toBe('application/octet-stream');
  });
});
