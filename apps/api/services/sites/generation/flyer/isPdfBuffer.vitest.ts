import { describe, expect, it } from 'vitest';

import { isPdfBuffer } from './isPdfBuffer.js';

describe('isPdfBuffer', () => {
  it('accepts a buffer starting with %PDF-', () => {
    expect(isPdfBuffer(Buffer.from('%PDF-1.7\nrest'))).toBe(true);
  });

  it('accepts %PDF- after leading bytes within 1024', () => {
    expect(isPdfBuffer(Buffer.concat([Buffer.alloc(10), Buffer.from('%PDF-1.7')]))).toBe(true);
  });

  it('rejects a PNG renamed to .pdf', () => {
    expect(isPdfBuffer(Buffer.from('\x89PNG\r\n\x1a\nIHDR', 'binary'))).toBe(false);
  });

  it('rejects %PDF- after byte 1024', () => {
    expect(isPdfBuffer(Buffer.concat([Buffer.alloc(1024), Buffer.from('%PDF-1.7')]))).toBe(false);
  });

  it('rejects an empty buffer', () => {
    expect(isPdfBuffer(Buffer.alloc(0))).toBe(false);
  });
});
