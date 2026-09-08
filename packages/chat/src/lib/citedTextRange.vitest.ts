/**
 * The mark in the source panel is an attribution claim: it says "these words are
 * what the answer quoted". A wrong range therefore misattributes, which is why
 * the helper returns null rather than guessing.
 */
import { describe, it, expect } from 'vitest';

import { findCitedRange } from './citedTextRange';

const CHUNK =
  'Das lässt sich z. B. in Form von informellen Spielregeln machen\noder als formelle Geschäftsordnung. Was für Euch die passende\nForm ist, entscheidet Ihr selbst in der Fraktion.';

describe('findCitedRange', () => {
  it('locates a byte-exact passage', () => {
    const range = findCitedRange(CHUNK, 'informellen Spielregeln machen');
    expect(range).not.toBeNull();
    expect(CHUNK.slice(range![0], range![1])).toBe('informellen Spielregeln machen');
  });

  it('locates a passage whose line breaks collapsed in transit', () => {
    // What the model echoes back: newlines flattened into single spaces.
    const range = findCitedRange(CHUNK, 'Spielregeln machen oder als formelle Geschäftsordnung');
    expect(range).not.toBeNull();
    // The slice keeps the SOURCE formatting, newline included.
    expect(CHUNK.slice(range![0], range![1])).toBe(
      'Spielregeln machen\noder als formelle Geschäftsordnung'
    );
  });

  it('returns null when the passage is not in this chunk', () => {
    expect(findCitedRange(CHUNK, 'Die Regelmäßigkeit der Fraktionssitzungen')).toBeNull();
  });

  it('refuses fragments too short to identify', () => {
    // "Form" occurs twice — marking the first would be a coin flip.
    expect(findCitedRange(CHUNK, 'Form')).toBeNull();
  });

  it('returns null without a cited text', () => {
    expect(findCitedRange(CHUNK, undefined)).toBeNull();
    expect(findCitedRange(CHUNK, '   ')).toBeNull();
  });
});
