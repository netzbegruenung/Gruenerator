/**
 * The seams, not the happy path.
 *
 * Both formatters pick a unit and round; if the threshold is tested against the
 * unrounded value, rounding can push the number past the seam it was just
 * measured against — "10.000 g" where the next value up says "10 kg".
 */
import { describe, expect, it } from 'vitest';

import {
  carComparison,
  formatCorridor,
  formatDuration,
  formatEnergy,
  formatGrams,
  referenceComparison,
} from './usageFormat';

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
    // No green-power instrument by default, so both methods coincide and the
    // corridor is pure reference uncertainty — the pre-14.08.2026 behaviour.
    market_emissions_g: 100,
    image_market_emissions_g: 20,
    market_backed_share: 0,
  };

  it('reports a favourable comparison with a corridor around the reference', () => {
    const r = referenceComparison(base);
    expect(r.hasComparison).toBe(true);
    expect(r.saved).toBe(true);
    expect(r.magnitude).toBe(120); // 200 - (100 - 20)
    expect(r.worst).toBeCloseTo(60); // 200*0.7 - 80
    expect(r.best).toBeCloseTo(180); // 200*1.3 - 80
    expect(r.marketDiffers).toBe(false);
    expect(r.straddlesZero).toBe(false);
  });

  it('widens the favourable end to the market-based figure, not the headline', () => {
    // 60 g of the 100 are location-only; market-based our text side is 30-20=10.
    const r = referenceComparison({
      ...base,
      market_emissions_g: 30,
      image_market_emissions_g: 20,
      market_backed_share: 1,
    });
    expect(r.marketDiffers).toBe(true);
    // Headline is unchanged — the market number must never move the main figure.
    expect(r.magnitude).toBe(120);
    // Unfavourable end still location-based, favourable end market-based.
    expect(r.worst).toBeCloseTo(60); // 200*0.7 - 80
    expect(r.best).toBeCloseTo(250); // 200*1.3 - 10
  });

  it('reports a corridor that STRADDLES zero instead of clamping the saving away', () => {
    // The bug this replaced: with a magnitude-only corridor the favourable end
    // rendered as "0 g" whenever the two accounting methods disagreed about the
    // sign, hiding a real saving. Numbers are the live platform figures of
    // 14.08.2026 — 468 g location vs 371 g reference, and 0 g market-based
    // because every text lane has a green-power instrument (only images do not).
    const r = referenceComparison({
      emissions_g: 596.02,
      image_emissions_g: 127.89,
      energy_wh: 2906.26,
      image_energy_wh: 363.33,
      reference_emissions_g: 370.91,
      reference_energy_wh: 1059.74,
      market_emissions_g: 127.89,
      image_market_emissions_g: 127.89,
      market_backed_share: 0.87,
    });
    expect(r.saved).toBe(false);
    expect(r.magnitude).toBeCloseTo(97.22, 1); // headline stays location-based
    expect(r.worst).toBeCloseTo(-208.5, 0); // 370.91*0.7 - 468.13
    expect(r.best).toBeCloseTo(482.18, 0); // 370.91*1.3 - 0
    expect(r.straddlesZero).toBe(true);
    expect(formatCorridor(r.worst, r.best)).toMatch(/^von .* mehr bis .* gespart$/);
  });

  it('ignores a market figure that has no instrument behind it', () => {
    // market_backed_share 0 means the lanes fell through to their location
    // factor; a lower number there would be a bug, and must not widen anything.
    const r = referenceComparison({
      ...base,
      market_emissions_g: 30,
      image_market_emissions_g: 20,
      market_backed_share: 0,
    });
    expect(r.marketDiffers).toBe(false);
  });

  it('subtracts the MARKET image half, not the location one', () => {
    // Regression: Regolo serves Qwen-Image from the same certified datacenter
    // as its text lanes, so its market-based image emissions are 0 while the
    // location-based ones are not. Subtracting `image_emissions_g` here (the
    // first cut of this feature) removed those twice and understated our
    // market-based text side, making the favourable end too optimistic.
    //
    // Location: 100 total, 20 of it images -> 80 g text.
    // Market:   30 total, 0 of it images (Regolo) -> 30 g text, NOT 10.
    const r = referenceComparison({
      ...base,
      market_emissions_g: 30,
      image_market_emissions_g: 0,
      market_backed_share: 1,
    });
    expect(r.textMarketEmissions).toBe(30);
    expect(r.best).toBeCloseTo(230); // 200*1.3 - 30, not 250
  });

  it('phrases a one-sided corridor without the straddle wording', () => {
    expect(formatCorridor(60, 180)).toBe('60 g gespart bis 180 g gespart');
    expect(formatCorridor(-30, -10)).toBe('30 g mehr bis 10 g mehr');
  });

  it('reports an unfavourable comparison rather than collapsing it', () => {
    const r = referenceComparison({ ...base, reference_emissions_g: 20 });
    expect(r.hasComparison).toBe(true);
    expect(r.saved).toBe(false);
    expect(r.magnitude).toBe(60); // |20 - 80|
    // Both ends are NEGATIVE here — an excess at either reading, no straddle.
    expect(r.worst).toBeLessThan(0);
    expect(r.best).toBeLessThan(0);
    expect(r.best).toBeGreaterThan(r.worst);
    expect(r.straddlesZero).toBe(false);
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
      market_emissions_g: 20,
      image_market_emissions_g: 20,
      market_backed_share: 0,
    });
    expect(r.hasComparison).toBe(false);
  });
});

describe('formatDuration', () => {
  it('keeps sub-minute durations in seconds', () => {
    // A single short read-aloud must not collapse to "0 Min.".
    expect(formatDuration(0)).toBe('0 Sek.');
    expect(formatDuration(45)).toBe('45 Sek.');
    expect(formatDuration(59)).toBe('59 Sek.');
  });

  it('switches to minutes at the seam', () => {
    expect(formatDuration(60)).toBe('1 Min.');
    expect(formatDuration(90)).toBe('2 Min.');
    expect(formatDuration(3540)).toBe('59 Min.');
  });

  // The rounded remainder used to be able to reach 60: the minutes were
  // rounded independently of the hours, so 1 h 59 m 50 s read "1 Std. 60 Min.".
  it('carries a rounded-up remainder into the hour instead of printing 60 Min.', () => {
    expect(formatDuration(7190)).toBe('2 Std.');
    expect(formatDuration(3590)).toBe('1 Std.');
    expect(formatDuration(3599)).toBe('1 Std.');
  });

  it('prints hours with the leftover minutes', () => {
    expect(formatDuration(3600)).toBe('1 Std.');
    expect(formatDuration(3660)).toBe('1 Std. 1 Min.');
    expect(formatDuration(9000)).toBe('2 Std. 30 Min.');
  });
});
