import * as jestDomMatchers from '@testing-library/jest-dom/matchers';
import { cleanup, configure } from '@testing-library/react';
import { afterEach, expect } from 'vitest';
import * as axeMatchers from 'vitest-axe/matchers';

expect.extend(jestDomMatchers);
expect.extend(axeMatchers);

configure({ asyncUtilTimeout: 3000 });

globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};
// framer-motion's viewport hooks (TypingAnimation in the overview search) construct one on mount.
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
Element.prototype.scrollIntoView ??= () => {};
// The editor sidebar (@ggraphic/editor-chrome) picks desktop or mobile layout via matchMedia,
// which jsdom lacks. Default to desktop; tests that need the phone layout stub it themselves.
window.matchMedia ??= (query: string) =>
  ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }) as MediaQueryList;

// ProseMirror measures the caret through Range geometry, which jsdom does not implement.
const emptyRect = () => new DOMRect();
Range.prototype.getBoundingClientRect ??= emptyRect;
Range.prototype.getClientRects ??= () =>
  ({
    length: 0,
    item: () => null,
    [Symbol.iterator]: [][Symbol.iterator],
  }) as unknown as DOMRectList;

afterEach(() => {
  cleanup();
});
