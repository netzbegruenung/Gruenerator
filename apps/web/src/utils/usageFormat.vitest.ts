/**
 * The seams, not the happy path.
 *
 * Both formatters pick a unit and round; if the threshold is tested against the
 * unrounded value, rounding can push the number past the seam it was just
 * measured against — "10.000 g" where the next value up says "10 kg".
 */
import { describe, expect, it } from 'vitest';

import { carComparison, formatEnergy, formatGrams, referenceComparison } from './usageFormat';

describe('formatGrams', () => {
  it('never prints a decimal', () => {
    for (const v of [0.4, 0.9996, 1, 154.1, 999.6, 1400, 9999.6, 10_000, 15_400]) {
      expect(formatGrams(v)).not.toMatch(/,/);
    }
  });

  it('switches unit on the rounded value, not the raw one', () => {
    // 9999,6 rounds to 10000 — printing "10.000 g" here and "10 kg" one step
    // later would put two spellings of the same magnitude side by side.
    expect(formatGrams(9999.6)).toBe('10 kg');
    expect(formatGrams(10_000)).toBe('10 kg');
    // Same seam at mg/g: 0,9996 g is 1 g, not 1000 mg.
    expect(formatGrams(0.9996)).toBe('1 g');
  });

  it('keeps grams until 10 kg so rounding cannot swallow a magnitude', () => {
    // "1 kg" for 1400 g would drop 30% to avoid a decimal point.
    expect(formatGrams(1400)).toBe('1.400 g');
    expect(formatGrams(154.1)).toBe('154 g');
    expect(formatGrams(0.4)).toBe('400 mg');
  });
});

describe('formatEnergy', () => {
  it('switches unit on the rounded value', () => {
    expect(formatEnergy(9999.6)).toBe('10 kWh');
    expect(formatEnergy(10_000)).toBe('10 kWh');
    expect(formatEnergy(4200)).toBe('4.200 Wh');
  });
});

describe('carComparison', () => {
  it('switches unit on the rounded value', () => {
    // 1500 g / 150 g per km = 10 km exactly.
    expect(carComparison(1500)).toBe('10 km Autofahrt');
    expect(carComparison(150)).toBe('1.000 m Autofahrt');
  });
});

describe('referenceComparison', () => {
  const base = {
    emissions_g: 100,
    image_emissions_g: 20,
    energy_wh: 300,
    image_energy_wh: 60,
    reference_emissions_g: 200,
    reference_energy_wh: 500,
  };

  it('reports a favourable comparison with a corridor around the reference', () => {
    const r = referenceComparison(base);
    expect(r.hasComparison).toBe(true);
    expect(r.saved).toBe(true);
    expect(r.magnitude).toBe(120); // 200 - (100 - 20)
    expect(r.low).toBeCloseTo(60); // 200*0.7 - 80
    expect(r.high).toBeCloseTo(180); // 200*1.3 - 80
  });

  it('reports an unfavourable comparison rather than collapsing it', () => {
    const r = referenceComparison({ ...base, reference_emissions_g: 20 });
    expect(r.hasComparison).toBe(true);
    expect(r.saved).toBe(false);
    expect(r.magnitude).toBe(60); // |20 - 80|
    // Corridor stays positive in the unfavourable direction too.
    expect(r.low).toBeGreaterThanOrEqual(0);
    expect(r.high).toBeGreaterThan(r.low);
  });

  it('has nothing to compare for pure image usage', () => {
    // Every gram and watt-hour is Flux; the GPT-4o reference has no image half.
    const r = referenceComparison({
      emissions_g: 20,
      image_emissions_g: 20,
      energy_wh: 60,
      image_energy_wh: 60,
      reference_emissions_g: 0,
      reference_energy_wh: 0,
    });
    expect(r.hasComparison).toBe(false);
  });
});
