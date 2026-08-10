import '@testing-library/jest-dom/vitest';

import { cleanup } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, expect } from 'vitest';
import * as axeMatchers from 'vitest-axe/matchers';

import { installMatchMediaStub } from './src/test/match-media';
import { server } from './src/test/msw-server';

// jest-dom + axe matchers (toBeInTheDocument, toHaveNoViolations, …).
expect.extend(axeMatchers);

installMatchMediaStub();

// jsdom kennt beides nicht. Popup-Komponenten (Base UI, Radix) messen ihren
// Anker, cmdk scrollt zum aktiven Eintrag — beides beim Mounten und ungeprüft.
// Ohne die Stubs stirbt jeder Test an einem fehlenden Browser-API statt an der
// Sache.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;
Element.prototype.scrollIntoView ??= function scrollIntoView() {};

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
