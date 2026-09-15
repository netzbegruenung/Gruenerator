import { describe, expect, it } from 'vitest';

import { splitSentences } from './sentenceSplitter.js';

describe('splitSentences', () => {
  it('returns finished sentences and keeps the unfinished tail as remainder', () => {
    expect(splitSentences('Erster Satz. Zweiter Satz! Dritter')).toEqual({
      complete: ['Erster Satz.', 'Zweiter Satz!'],
      remainder: 'Dritter',
    });
  });

  it('does not split on German abbreviations', () => {
    const { complete, remainder } = splitSentences(
      'Wir kommen z.B. am Dienstag. Dr. Müller auch. '
    );
    expect(complete).toEqual(['Wir kommen z.B. am Dienstag.', 'Dr. Müller auch.']);
    expect(remainder).toBe('');
  });
});
