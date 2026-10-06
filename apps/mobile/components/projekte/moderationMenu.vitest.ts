import { describe, expect, it } from 'vitest';

import { buildModerationActions } from './moderationMenu';

const ids = (r: boolean, h: boolean) => buildModerationActions(r, h).map((a) => a.id);

describe('buildModerationActions', () => {
  it('offers both options when both apply', () => {
    expect(ids(true, true)).toEqual(['report', 'hide']);
  });
  it('offers only what applies', () => {
    expect(ids(true, false)).toEqual(['report']);
    expect(ids(false, true)).toEqual(['hide']);
  });
  it('is empty when neither applies', () => {
    expect(ids(false, false)).toEqual([]);
  });
});
