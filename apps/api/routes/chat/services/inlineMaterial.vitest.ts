import { describe, it, expect } from 'vitest';

import {
  INLINE_MATERIAL_ATTACHMENT_NAME,
  INLINE_MATERIAL_MIN_CHARS,
  inlineMaterialAttachment,
} from './streamContext.js';

const clean = { regenerate: false, hasDocumentAttachment: false };
const material = (chars: number): string => 'a'.repeat(chars);

describe('inlineMaterialAttachment', () => {
  it('carries a long pasted article forward as a document', () => {
    // The measured case: thread 5b184c40 opened with 10.327 chars of article and
    // left no attachment row behind, so steps 2-4 had no source to check against.
    const result = inlineMaterialAttachment(material(10_327), clean);
    expect(result).not.toBeNull();
    expect(result?.name).toBe(INLINE_MATERIAL_ATTACHMENT_NAME);
    expect(result?.extractedText).toHaveLength(10_327);
    expect(result?.isImage).toBe(false);
  });

  it('leaves an ordinary instruction alone', () => {
    expect(inlineMaterialAttachment(material(INLINE_MATERIAL_MIN_CHARS - 1), clean)).toBeNull();
  });

  it('takes the material at exactly the threshold', () => {
    expect(inlineMaterialAttachment(material(INLINE_MATERIAL_MIN_CHARS), clean)).not.toBeNull();
  });

  it('stays out of the way when the turn brought a real document', () => {
    // That file is the material and persists on its own path; a second copy of
    // the same turn would only spend context twice.
    expect(
      inlineMaterialAttachment(material(10_000), { ...clean, hasDocumentAttachment: true })
    ).toBeNull();
  });

  it('does not duplicate the row on regenerate', () => {
    // Regenerate reuses the unchanged user message — the row already exists.
    expect(inlineMaterialAttachment(material(10_000), { ...clean, regenerate: true })).toBeNull();
  });

  it('carries a promoted paste forward even below the threshold', () => {
    // The measured case of 14.08.2026: a 1.339-char source text, promoted to the
    // prompt and therefore dropped from the attachment list. Not persisted, the
    // next turn ("bitte korrigieren") carries the PREVIOUS article back in — one
    // turn of correct behaviour, then the same wrong original as before.
    const result = inlineMaterialAttachment(material(1_339), { ...clean, promoted: true });
    expect(result?.extractedText).toHaveLength(1_339);
    // Ohne die Beförderung bleibt die Länge die Grenze.
    expect(inlineMaterialAttachment(material(1_339), clean)).toBeNull();
  });

  it('carries nothing forward for an empty promoted message', () => {
    expect(inlineMaterialAttachment('   ', { ...clean, promoted: true })).toBeNull();
  });

  it('still yields to a real document and to regenerate when promoted', () => {
    // Die Beförderung hebt die Längengrenze, nicht die beiden anderen Sperren.
    const p = { ...clean, promoted: true };
    expect(inlineMaterialAttachment(material(1_339), { ...p, regenerate: true })).toBeNull();
    expect(
      inlineMaterialAttachment(material(1_339), { ...p, hasDocumentAttachment: true })
    ).toBeNull();
  });

  it('measures size in bytes, not chars', () => {
    const umlauts = 'ü'.repeat(4_000);
    expect(inlineMaterialAttachment(umlauts, clean)?.sizeBytes).toBe(8_000);
  });
});
