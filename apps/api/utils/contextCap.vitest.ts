import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// createLogger returns a fresh instance per call, so the module's own logger
// has to be replaced rather than spied on.
const warn = vi.fn();
vi.mock('./logger.js', () => ({
  createLogger: () => ({ warn, info: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

const { applyContextCap, applyCountCap } = await import('./contextCap.js');

/**
 * Stufe 5: a cap may shrink model-facing context, but not quietly. The 500-char
 * replay cap sat in the loop for months cutting five-source research blocks down
 * to one and a half, and nothing anywhere reported it.
 */
describe('applyContextCap', () => {
  beforeEach(() => warn.mockClear());
  afterEach(() => warn.mockReset());

  it('returns the text untouched when the cap does not bind', () => {
    expect(applyContextCap('kurz', 100, 'test')).toBe('kurz');
  });

  it('stays SILENT when nothing is lost — logs must mean something', () => {
    applyContextCap('kurz', 100, 'test');
    expect(warn).not.toHaveBeenCalled();
  });

  it('is silent at exactly the cap (boundary)', () => {
    expect(applyContextCap('abcde', 5, 'test')).toBe('abcde');
    expect(warn).not.toHaveBeenCalled();
  });

  it('truncates and reports when the cap binds', () => {
    const out = applyContextCap('x'.repeat(1000), 100, 'test:label');
    expect(out).toHaveLength(101); // 100 + ellipsis
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('names the site and quantifies the loss', () => {
    applyContextCap('x'.repeat(1000), 100, 'sourceRegistry:snippet');
    const msg = String(warn.mock.calls[0]?.[0]);
    expect(msg).toContain('sourceRegistry:snippet');
    expect(msg).toContain('1000');
    expect(msg).toContain('100');
    expect(msg).toContain('900 dropped');
    expect(msg).toContain('90%');
  });

  it('can omit the ellipsis where the caller formats the marker itself', () => {
    expect(applyContextCap('x'.repeat(10), 4, 'test', false)).toBe('xxxx');
  });
});

describe('applyCountCap', () => {
  beforeEach(() => warn.mockClear());
  afterEach(() => warn.mockReset());

  it('returns everything when the cap does not bind', () => {
    expect(applyCountCap([1, 2, 3], 5, 'test')).toEqual([1, 2, 3]);
    expect(warn).not.toHaveBeenCalled();
  });

  it('drops the tail and reports how many sources were lost', () => {
    expect(applyCountCap([1, 2, 3, 4, 5], 2, 'search:results')).toEqual([1, 2]);
    const msg = String(warn.mock.calls[0]?.[0]);
    expect(msg).toContain('search:results');
    expect(msg).toContain('3 dropped');
  });

  it('does not alias the input array', () => {
    const input = [1, 2, 3];
    const out = applyCountCap(input, 10, 'test');
    expect(out).not.toBe(input);
  });
});
