import { describe, expect, it } from 'vitest';

import { ISO_DATE_RE, isoToExcelSerial } from './dateSerial.js';

describe('isoToExcelSerial', () => {
  it('converts ISO dates to the correct Excel serial (the model must not guess these)', () => {
    // 2026-03-15 = 46096. The AI once emitted 43167 (= 2018-03-07), ~8 years off —
    // this is exactly the bug the deterministic conversion prevents.
    expect(isoToExcelSerial('2026-03-15')).toBe(46096);
    expect(isoToExcelSerial('1970-01-01')).toBe(25569); // Unix epoch anchor
    expect(isoToExcelSerial('1900-01-01')).toBe(2); // Excel's off-by-one 1900 origin
  });

  it('keeps date arithmetic correct (=A1+1 → next day)', () => {
    expect(isoToExcelSerial('2026-03-16') - isoToExcelSerial('2026-03-15')).toBe(1);
  });

  it('handles an ISO datetime as a fractional serial', () => {
    expect(isoToExcelSerial('2026-03-15T12:00')).toBeCloseTo(46096.5, 5);
  });
});

describe('ISO_DATE_RE', () => {
  it('matches ISO dates and datetimes, not ids/codes/plain numbers', () => {
    expect(ISO_DATE_RE.test('2026-03-15')).toBe(true);
    expect(ISO_DATE_RE.test('2026-03-15T12:00')).toBe(true);
    expect(ISO_DATE_RE.test('2026-03-15T12:00:30')).toBe(true);
    expect(ISO_DATE_RE.test('00123')).toBe(false);
    expect(ISO_DATE_RE.test('2-2')).toBe(false);
    expect(ISO_DATE_RE.test('15.03.2026')).toBe(false);
  });
});
