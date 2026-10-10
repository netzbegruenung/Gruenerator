import { describe, expect, it, vi } from 'vitest';

vi.mock('../../config/env.js', () => ({ env: { NODE_ENV: 'test', REMBG_URL: undefined } }));

import { resolveRembgUrl } from './rembgIntegration.js';

describe('resolveRembgUrl', () => {
  it('uses the local stand-in in development when unset', () => {
    expect(resolveRembgUrl(undefined, 'development')).toBe('http://127.0.0.1:7070');
  });

  it('keeps the sidecar default outside development', () => {
    expect(resolveRembgUrl(undefined, 'production')).toBe('http://rembg:7000');
    expect(resolveRembgUrl(undefined, 'test')).toBe('http://rembg:7000');
  });

  it('prefers an explicit REMBG_URL', () => {
    expect(resolveRembgUrl('http://x:1', 'development')).toBe('http://x:1');
  });
});
