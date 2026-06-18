/**
 * Tests for fileUtils — describeFileReadError mapping
 *
 * Covers the GlitchTip "Fehler beim Lesen" path: a FileReader DOMException must
 * become an actionable German message, and every case must keep the error name
 * in `[...]` so telemetry stays diagnosable.
 */

import { describe, expect, it } from 'vitest';

import { describeFileReadError } from './fileUtils';

describe('describeFileReadError', () => {
  it('gives actionable guidance for NotReadableError (file locked / open in Word)', () => {
    const error = new DOMException('locked', 'NotReadableError');
    const result = describeFileReadError('Antrag-LR_Bafög.docx', error);

    expect(result.message).toContain('Antrag-LR_Bafög.docx');
    expect(result.message).toContain('anderen Programm');
    expect(result.message).toContain('[NotReadableError]');
  });

  it('treats SecurityError the same as NotReadableError', () => {
    const error = new DOMException('blocked', 'SecurityError');
    const result = describeFileReadError('foo.docx', error);

    expect(result.message).toContain('anderen Programm');
    expect(result.message).toContain('[SecurityError]');
  });

  it('keeps the bare "Fehler beim Lesen" shape for other errors, with the name appended', () => {
    const error = new DOMException('aborted', 'AbortError');
    const result = describeFileReadError('foo.pdf', error);

    expect(result.message).toBe('Fehler beim Lesen: foo.pdf [AbortError]');
  });
});
