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

  it('keeps an in-range source link, numeric label included', () => {
    const t = 'Siehe [2024](quelle:3) und [Wahlprogramm](quelle:1).';
    expect(stripOutOfRangeCitations(t, 3)).toEqual({ text: t, changed: false });
  });

  it('reduces a source link to an unknown id to its title', () => {
    const r = stripOutOfRangeCitations('- [Kohleausstieg](quelle:9)\n- [Tagebau](quelle:2)', 3);
    expect(r.changed).toBe(true);
    expect(r.text).toBe('- Kohleausstieg\n- [Tagebau](quelle:2)');
  });

  it('writes a translated `source:` link back as `quelle:` (#5315)', () => {
    const r = stripOutOfRangeCitations('* [PersVG](source:3) vom 11.08.2026 und [9](source:9)', 3);
    expect(r).toEqual({ text: '* [PersVG](quelle:3) vom 11.08.2026 und 9', changed: true });
  });

  it('rewrites only the scheme, leaving the rest of the answer byte for byte', () => {
    const t = '  Siehe [Titel](source:1).\n\n```python\ndef f():\n    x = 1\n```\n';
    expect(stripOutOfRangeCitations(t, 1)).toEqual({
      text: t.replace('source:1', 'quelle:1'),
      changed: true,
    });
  });

  it('does not touch non-citation brackets', () => {
    const t = 'Der Zeitraum [2020-2024] war entscheidend.';
    expect(stripOutOfRangeCitations(t, 3).changed).toBe(false);
  });
});
