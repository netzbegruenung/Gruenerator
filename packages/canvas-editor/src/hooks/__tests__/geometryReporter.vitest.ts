import { describe, it, expect } from 'vitest';

import { isReportableGeometry, type Geometry } from '../useGeometryReporter';

describe('isReportableGeometry', () => {
  it('meldet die erste brauchbare Messung', () => {
    expect(isReportableGeometry(null, [50, 280, 60, 60])).toBe(true);
  });

  it('verwirft Messungen ohne Ausdehnung (Bild noch nicht geladen)', () => {
    expect(isReportableGeometry(null, [50, 280, 0, 60])).toBe(false);
    expect(isReportableGeometry(null, [50, 280, 60, 0])).toBe(false);
  });

  it('verwirft NaN', () => {
    expect(isReportableGeometry(null, [Number.NaN, 280, 60, 60])).toBe(false);
  });

  it('verwirft Sub-Pixel-Rauschen', () => {
    const previous: Geometry = [50, 280.0, 60, 60];
    expect(isReportableGeometry(previous, [50.2, 280.1, 60, 60])).toBe(false);
  });

  it('meldet eine echte Verschiebung', () => {
    const previous: Geometry = [50, 280, 60, 60];
    expect(isReportableGeometry(previous, [50, 360, 60, 60])).toBe(true);
  });

  it('meldet eine Groessenaenderung bei gleicher Position', () => {
    const previous: Geometry = [50, 280, 60, 60];
    expect(isReportableGeometry(previous, [50, 280, 60, 92])).toBe(true);
  });
});
