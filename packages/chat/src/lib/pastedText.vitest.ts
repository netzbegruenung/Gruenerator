import { describe, expect, it } from 'vitest';

import {
  isPastedTextAttachment,
  PASTED_TEXT_ATTACHMENT_NAME,
  pastedTextPreview,
  shouldCreatePastedTextAttachment,
} from './pastedText';

describe('shouldCreatePastedTextAttachment', () => {
  it('keeps short, single-line prompts in the textarea', () => {
    expect(shouldCreatePastedTextAttachment('Mach daraus einen Instagram-Post.')).toBe(false);
  });

  it('turns long text into an attachment', () => {
    expect(shouldCreatePastedTextAttachment('a'.repeat(600))).toBe(true);
  });

  it('turns substantial multiline text into an attachment', () => {
    expect(
      shouldCreatePastedTextAttachment(`${'a'.repeat(80)}\n${'b'.repeat(80)}\n${'c'.repeat(80)}`)
    ).toBe(true);
  });
});

describe('pasted text helpers', () => {
  it('identifies only the synthetic pasted-text attachment', () => {
    expect(isPastedTextAttachment(PASTED_TEXT_ATTACHMENT_NAME, 'text/plain')).toBe(true);
    expect(isPastedTextAttachment('Notizen.txt', 'text/plain')).toBe(false);
  });

  it('normalizes line endings and shortens previews', () => {
    expect(pastedTextPreview('eins\r\nzwei', 20)).toBe('eins\nzwei');
    expect(pastedTextPreview('a'.repeat(12), 10)).toBe('aaaaaaaaaa…');
  });
});
