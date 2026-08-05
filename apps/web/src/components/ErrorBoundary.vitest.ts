import { describe, expect, it } from 'vitest';

import ErrorBoundary from './ErrorBoundary';

describe('ErrorBoundary.isChunkLoadError', () => {
  it.each([
    'Failed to fetch dynamically imported module',
    'error loading dynamically imported module',
    'Importing a module script failed',
    'Unable to preload CSS',
    'Loading chunk 12 failed',
    'Loading CSS chunk 3 failed',
    // Firefox: React.lazy resolving payload._result to undefined after a
    // __vitePreload race (see apps/web/src/index.tsx's vite:preloadError handler).
    'can\'t access property "default", e._result is undefined',
    // Chrome/V8 phrasing for the same underlying failure.
    "Cannot read properties of undefined (reading 'default')",
  ])('recognizes "%s" as a recoverable chunk-load error', (message) => {
    expect(ErrorBoundary.isChunkLoadError(new Error(message))).toBe(true);
  });

  it('recognizes ChunkLoadError by name regardless of message', () => {
    const error = new Error('boom');
    error.name = 'ChunkLoadError';
    expect(ErrorBoundary.isChunkLoadError(error)).toBe(true);
  });

  it('does not misclassify an unrelated error that merely mentions a _result field', () => {
    expect(
      ErrorBoundary.isChunkLoadError(new Error('validation failed: _result is undefined'))
    ).toBe(false);
  });

  it('does not misclassify a generic error', () => {
    expect(ErrorBoundary.isChunkLoadError(new Error('Network request failed'))).toBe(false);
  });

  it('handles null', () => {
    expect(ErrorBoundary.isChunkLoadError(null)).toBe(false);
  });
});
