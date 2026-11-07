import { describe, expect, it } from 'vitest';

import { toMonitorLocale } from './monitorLocale';

describe('toMonitorLocale', () => {
  it('maps de-AT to at and everything else to de', () => {
    expect(toMonitorLocale('de-AT')).toBe('at');
    expect(toMonitorLocale('de-DE')).toBe('de');
    expect(toMonitorLocale(null)).toBe('de');
    expect(toMonitorLocale(undefined)).toBe('de');
  });
});
