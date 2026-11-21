import { describe, expect, it } from 'vitest';

import { buildGroupPostFormData } from './postFormData.js';

function recorder() {
  const calls: unknown[][] = [];
  return {
    calls,
    append: (...args: unknown[]) => {
      calls.push(args);
    },
  };
}

describe('buildGroupPostFormData', () => {
  it('appends the body first, then web files with their name', () => {
    const rec = recorder();
    const file = new File(['x'], 'a.txt', { type: 'text/plain' });
    buildGroupPostFormData(rec, 'Hallo', [file]);
    expect(rec.calls).toEqual([
      ['body', 'Hallo'],
      ['files', file, 'a.txt'],
    ]);
  });

  it('appends react native files as they are, without a third argument', () => {
    const rec = recorder();
    const native = { uri: 'file:///a.jpg', name: 'a.jpg', type: 'image/jpeg' };
    buildGroupPostFormData(rec, '', [native]);
    expect(rec.calls[1]).toEqual(['files', native]);
  });
});
