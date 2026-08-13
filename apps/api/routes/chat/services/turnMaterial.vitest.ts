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
    // A legacy row without stored text: the formatter injects its summary, so
    // the summary is what the model sees and what counts.
    expect(
      turnMaterialChars({
        threadAttachments: [{ isImage: false, extractedText: null, summary: 'x'.repeat(700) }],
      })
    ).toBe(700);
  });

  it('ignores a vectorised document — it is not in the prompt', () => {
    // The 13.08.2026 defect. `formatThreadAttachmentsContext` drops every row
    // with a documentId (RAG serves it per query instead), so its text reaches
    // the model nowhere. Counted anyway, the number took the writer's tool
    // catalog away for material that was not there.
    expect(
      turnMaterialChars({
        threadAttachments: [
          {
            isImage: false,
            documentId: '61f23708-516b-48c9-b977-404610b77bf2',
            extractedText: 'x'.repeat(57_215),
            summary: 'x'.repeat(1_293),
          },
        ],
      })
    ).toBe(0);
  });

  it('counts the un-vectorised sibling in the same thread', () => {
    // Both filters key off the same field, so the split has to survive a mixed
    // thread — otherwise the fix would trade one blind spot for another.
    expect(
      turnMaterialChars({
        threadAttachments: [
          {
            isImage: false,
            documentId: 'a13dc241-543f-4e2f-8ec8-2872d6109296',
            extractedText: 'x'.repeat(57_215),
          },
          { isImage: false, documentId: null, extractedText: 'x'.repeat(3_400) },
        ],
      })
    ).toBe(3_400);
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
