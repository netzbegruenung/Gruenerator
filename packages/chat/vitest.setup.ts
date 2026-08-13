import '@testing-library/jest-dom/vitest';

import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

import { installMatchMediaStub } from './src/test/match-media';

installMatchMediaStub();

// cmdk (every mention panel) measures its list on mount and scrolls the active
// item into view. jsdom has neither API, and both throw rather than no-op, so a
// panel test dies in a layout effect before it can assert anything.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};
Element.prototype.scrollIntoView ??= () => {};

// Unmount rendered trees between tests so queries never see a prior test's DOM.
afterEach(() => {
  cleanup();
});
