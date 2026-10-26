// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';

import { scrollBehavior } from './scrollBehavior';

function mockMedia(reduce: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({ matches: reduce && query.includes('reduce') }))
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  delete document.documentElement.dataset.reduceMotion;
});

describe('scrollBehavior', () => {
  it('is smooth by default', () => {
    mockMedia(false);
    expect(scrollBehavior()).toBe('smooth');
  });

  it('is auto when the system asks for reduced motion', () => {
    mockMedia(true);
    expect(scrollBehavior()).toBe('auto');
  });

  it('is auto when the editor switch is on', () => {
    mockMedia(false);
    document.documentElement.dataset.reduceMotion = 'true';
    expect(scrollBehavior()).toBe('auto');
  });
});
