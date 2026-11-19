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
Element.prototype.scrollIntoView ??= () => {};

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
