import { describe, expect, it } from 'vitest';

import { groupColorTone } from './groupColorTone';

describe('groupColorTone', () => {
  it('picks the light or dark tone of a palette colour', () => {
    expect(groupColorTone('gruen', false)?.bg).toBe('#DDEFD9');
    expect(groupColorTone('gruen', true)?.bg).toBe('#15241A');
  });

  it('is null without or with an unknown colour', () => {
    expect(groupColorTone(null, false)).toBeNull();
    expect(groupColorTone(undefined, true)).toBeNull();
    expect(groupColorTone('neon', false)).toBeNull();
  });
});
