import { describe, expect, it } from 'vitest';

import { resolveSharepicType } from './promptRoute.js';

describe('resolveSharepicType', () => {
  it('keeps the German templates outside Austria', () => {
    expect(resolveSharepicType('dreizeilen', 'de-DE')).toEqual({
      type: 'dreizeilen',
      frontendType: 'dreizeilen',
    });
    expect(resolveSharepicType('veranstaltung', null)).toEqual({
      type: 'veranstaltung',
      frontendType: 'veranstaltung',
    });
  });

  it('gives Austrian users the Austrian template', () => {
    expect(resolveSharepicType('dreizeilen', 'de-AT').frontendType).toBe('dreizeilen-overlay-at');
    expect(resolveSharepicType('zitat_pure', 'de-AT').frontendType).toBe('zitat-pure-at');
    expect(resolveSharepicType('info', 'de-AT').frontendType).toBe('info-at');
  });

  it('falls back to the Austrian Dreizeiler where Austria has no such template', () => {
    for (const type of ['veranstaltung', 'simple']) {
      expect(resolveSharepicType(type, 'de-AT')).toEqual({
        type: 'dreizeilen',
        frontendType: 'dreizeilen-overlay-at',
      });
    }
  });
});
