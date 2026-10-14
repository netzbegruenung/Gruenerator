import { describe, expect, it } from '@jest/globals';

import { ListRow } from '../components/common/ListRow';

// Release builds run the React Compiler; this lane has to as well, or a
// component test proves the uncompiled code that never ships (#4419).
// The compiler runtime's memo-cache call, as babel's CJS interop emits it:
// `var $ = (0, _compilerRuntime.c)(56)`.
describe('jest lane', () => {
  it('runs the React Compiler like a release build', () => {
    expect(ListRow.toString()).toMatch(/\(0, \w+\.c\)\(\d+\)/);
  });
});
