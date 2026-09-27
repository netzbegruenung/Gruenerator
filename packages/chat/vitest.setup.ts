import '@testing-library/jest-dom/vitest';

import { cleanup, configure } from '@testing-library/react';
import { afterEach, expect } from 'vitest';
import * as axeMatchers from 'vitest-axe/matchers';

import { installMatchMediaStub } from './src/test/match-media';

// jest-dom + axe matchers (toBeInTheDocument, toHaveNoViolations, …). The axe
// runner itself is preconfigured in `src/test-utils.ts` — import it from there.
expect.extend(axeMatchers);

// RTL's default asyncUtilTimeout of 1000 ms assumes a mounted tree waiting only
// on the network. The FIRST findBy* of a file also pays the cold start (Vite
// transform, initial jsdom render, MSW's first interception, one react-query
// round trip) — ~800 ms on a loaded CI runner. NotebooksIndexPage.vitest.tsx sat
// on that edge and failed at a reproducible ~1850 ms on master and on every open
// PR, always its first test. Polling returns as soon as the node appears, so a
// higher ceiling costs green runs nothing; it stays under vitest's 5000 ms
// testTimeout so a genuinely broken test still dies on RTL's error with a DOM
// dump, not on the harness timeout without one.
configure({ asyncUtilTimeout: 3000 });

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
