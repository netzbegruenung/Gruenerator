import { describe, it, expect } from 'vitest';

import { stripOutOfRangeCitations } from './citationStrip.js';

describe('stripOutOfRangeCitations', () => {
  it('leaves in-range citations untouched', () => {
    const t = 'Die Grünen fordern X [1] und Y [2, 3].';
    expect(stripOutOfRangeCitations(t, 3)).toEqual({ text: t, changed: false });
  });

  it('removes an all-out-of-range single marker and tidies whitespace', () => {
    const r = stripOutOfRangeCitations('Die Position ist klar [4] und wichtig.', 3);
    expect(r.changed).toBe(true);
    expect(r.text).toBe('Die Position ist klar und wichtig.');
  });

  it('trims a mixed group to only the valid numbers', () => {
    const r = stripOutOfRangeCitations('Beleg dafür [2, 7].', 3);
    expect(r.changed).toBe(true);
    expect(r.text).toBe('Beleg dafür [2].');
  });

  it('handles the live bug: [4]..[9] with 3 sources', () => {
    const r = stripOutOfRangeCitations('A [4] B [5] C [6, 7] D [8, 9] und E [2].', 3);
    expect(r.changed).toBe(true);
    // every out-of-range marker gone, the one valid [2] preserved
    expect(r.text).not.toMatch(/\[(4|5|6|7|8|9)\]/);
    expect(r.text).toContain('[2]');
  });

  it('drops everything when maxId is 0 (no sources)', () => {
    const r = stripOutOfRangeCitations('Behauptung [1] ohne Quelle.', 0);
    expect(r.changed).toBe(true);
    expect(r.text).toBe('Behauptung ohne Quelle.');
  });

  it('does not touch non-citation brackets', () => {
    const t = 'Der Zeitraum [2020-2024] war entscheidend.';
    expect(stripOutOfRangeCitations(t, 3).changed).toBe(false);
  });
});
