import { describe, it, expect } from 'vitest';

import { turnMaterialChars } from './turnMaterial.js';

describe('turnMaterialChars', () => {
  it('counts this turn’s upload', () => {
    expect(turnMaterialChars({ attachmentContext: 'x'.repeat(500) })).toBe(500);
  });

  it('counts documents carried over from earlier turns', () => {
    // The 13.08.2026 thread: one pasted article, re-injected on every follow-up.
    expect(
      turnMaterialChars({
        threadAttachments: [
          { isImage: false, extractedText: 'x'.repeat(10_149), summary: 'short' },
        ],
      })
    ).toBe(10_149);
  });

  it('falls back to the summary when the full text was not kept', () => {
    // Large docs get vectorised instead of re-injected; the summary is all the
    // prompt sees, and it is still material.
    expect(
      turnMaterialChars({
        threadAttachments: [{ isImage: false, extractedText: null, summary: 'x'.repeat(700) }],
      })
    ).toBe(700);
  });

  it('ignores images', () => {
    // A picture contributes a vision description, not text to transform.
    expect(
      turnMaterialChars({
        threadAttachments: [{ isImage: true, extractedText: 'x'.repeat(9_000) }],
      })
    ).toBe(0);
  });

  it('adds this turn to the carried ones', () => {
    expect(
      turnMaterialChars({
        attachmentContext: 'x'.repeat(200),
        threadAttachments: [{ isImage: false, extractedText: 'x'.repeat(300) }],
      })
    ).toBe(500);
  });

  it('is zero for an ordinary question', () => {
    expect(turnMaterialChars({})).toBe(0);
    expect(turnMaterialChars({ attachmentContext: null, threadAttachments: [] })).toBe(0);
  });
});
