import * as jestDomMatchers from '@testing-library/jest-dom/matchers';
import { cleanup } from '@testing-library/react';
import { afterEach, expect } from 'vitest';
import * as axeMatchers from 'vitest-axe/matchers';

// toHaveNoViolations — the toolbar and the image dialog carry hand-written
// roles and aria-*, which is exactly where axe earns its keep.
expect.extend(jestDomMatchers);
expect.extend(axeMatchers);

// Unmount rendered trees between tests so queries never see a prior test's DOM.
afterEach(() => {
  cleanup();
});
