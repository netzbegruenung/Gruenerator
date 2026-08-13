import { describe, expect, it } from 'vitest';

import {
  isOcrWolkeExtension,
  isPlaintextWolkeExtension,
  isSupportedWolkeFile,
  WOLKE_SUPPORTED_EXTENSIONS,
  wolkeFileExtension,
} from './supportedFileTypes.js';

describe('wolkeFileExtension', () => {
  it('lowercases the extension so SHOUTED filenames still match', () => {
    expect(wolkeFileExtension('ANTRAG.PDF')).toBe('.pdf');
  });

  it('returns an empty string for a name without extension (a folder)', () => {
    expect(wolkeFileExtension('Stadtrat')).toBe('');
  });

  it('takes only the last extension', () => {
    expect(wolkeFileExtension('bericht.tar.gz')).toBe('.gz');
  });
});

describe('isSupportedWolkeFile', () => {
  it('accepts every extension processFile can extract', () => {
    for (const ext of WOLKE_SUPPORTED_EXTENSIONS) {
      expect(isSupportedWolkeFile(`datei${ext}`)).toBe(true);
    }
  });

  it('rejects .doc — the browse endpoint used to offer it and processFile rejected it', () => {
    expect(isSupportedWolkeFile('altes-protokoll.doc')).toBe(false);
  });

  it('rejects office formats we cannot extract yet', () => {
    expect(isSupportedWolkeFile('haushalt.xlsx')).toBe(false);
    expect(isSupportedWolkeFile('notiz.odt')).toBe(false);
  });

  it('rejects a folder name', () => {
    expect(isSupportedWolkeFile('Wärmeplanung 2026')).toBe(false);
  });

  it('judges by extension only — a mislabelled file is caught later by extraction', () => {
    expect(isSupportedWolkeFile('Geschichte _ Stadt Plattling.pdf')).toBe(true);
  });
});

describe('extraction routing', () => {
  it('routes every supported extension to exactly one extraction branch', () => {
    for (const ext of WOLKE_SUPPORTED_EXTENSIONS) {
      expect(isOcrWolkeExtension(ext) !== isPlaintextWolkeExtension(ext)).toBe(true);
    }
  });

  it('sends .pptx and images through OCR', () => {
    expect(isOcrWolkeExtension('.pptx')).toBe(true);
    expect(isOcrWolkeExtension('.png')).toBe(true);
  });

  it('reads .txt and .md directly', () => {
    expect(isPlaintextWolkeExtension('.md')).toBe(true);
    expect(isOcrWolkeExtension('.md')).toBe(false);
  });
});
