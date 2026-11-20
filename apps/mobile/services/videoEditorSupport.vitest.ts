import { describe, expect, it } from 'vitest';

import { isVideoEditorSupported } from './videoEditorSupport';

describe('isVideoEditorSupported', () => {
  it.each([
    ['ios', '26.0', true],
    ['ios', '26.1.2', true],
    ['ios', '27', true],
    ['ios', '18.6', false],
    ['ios', '', false],
    ['android', 36, true],
    ['web', '1', false],
  ])('%s %s → %s', (os, version, expected) => {
    expect(isVideoEditorSupported(os, version)).toBe(expected);
  });
});
