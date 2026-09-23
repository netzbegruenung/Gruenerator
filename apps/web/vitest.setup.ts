import '@testing-library/jest-dom/vitest';

import { cleanup, configure } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, expect } from 'vitest';
import * as axeMatchers from 'vitest-axe/matchers';

import { installMatchMediaStub } from './src/test/match-media';
import { server } from './src/test/msw-server';

// jest-dom + axe matchers (toBeInTheDocument, toHaveNoViolations, …).
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

// jsdom kennt beides nicht. Popup-Komponenten (Base UI, Radix) messen ihren
// Anker, cmdk scrollt zum aktiven Eintrag — beides beim Mounten und ungeprüft.
// Ohne die Stubs stirbt jeder Test an einem fehlenden Browser-API statt an der
// Sache.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;
// Same category: framer-motion's viewport hooks (TypingAnimation and every
// `whileInView`) construct one while mounting.
globalThis.IntersectionObserver ??= class {
  readonly root = null;
  readonly rootMargin = '';
  readonly thresholds: readonly number[] = [];
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
} as unknown as typeof IntersectionObserver;
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
