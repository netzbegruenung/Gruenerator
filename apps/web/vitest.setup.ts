import '@testing-library/jest-dom/vitest';

import { cleanup } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, expect } from 'vitest';
import * as axeMatchers from 'vitest-axe/matchers';

import { server } from './src/test/msw-server';

// jest-dom + axe matchers (toBeInTheDocument, toHaveNoViolations, …).
expect.extend(axeMatchers);

// MSW: intercept HTTP for the dom lane. Unhandled requests error out so a stray
// real network call is a loud failure, not a silent hang. Pure-render tests make
// no requests, so this is a no-op for them.
beforeAll(() => {
  server.listen({ onUnhandledRequest: 'error' });
});

afterEach(() => {
  // Unmount trees so queries never see a prior test's DOM, and drop per-test
  // request handlers so cases don't leak into each other.
  cleanup();
  server.resetHandlers();
});

afterAll(() => {
  server.close();
});
