import { describe, it, expect } from 'vitest';

import { emissionsFromEnergy, estimateFootprint, gridIntensityFor } from '../energyFootprint.js';

/**
 * Anchors taken from the live probe of api.greenpt.ai on 2026-07-31
 * (apps/api/scripts/probeGreenptImpact.ts). They guard the coefficient table
 * against silent drift: if someone re-fits the numbers, these assertions say
 * whether the fit still reproduces reality.
 */
describe('emissionsFromEnergy', () => {
  it('inverts a measured GreenPT pair exactly', () => {
    // Verbatim from one response (mistral-medium-3.5-128b, 36 in / 187 out).
    // Feeding back the intensity GreenPT implicitly used must return their own
    // emissions figure — that is the unit conversion (Wms -> kWh -> ug) under test.
    const energyWms = 3_112_097;
    const emissionsUg = 26_311;
    const impliedIntensity = (emissionsUg * 3600) / energyWms;
    expect(impliedIntensity).toBeCloseTo(30.4, 1);
    expect(emissionsFromEnergy(energyWms, impliedIntensity)).toBe(emissionsUg);
  });

  it('scales linearly with grid intensity', () => {
    expect(emissionsFromEnergy(3_600_000, 100)).toBe(100_000);
    expect(emissionsFromEnergy(3_600_000, 350)).toBe(350_000);
  });
});

describe('gridIntensityFor', () => {
  it('separates the French and German upstreams', () => {
    // The recorded provider is the upstream, so Scaleway-routed Mistral Medium
    // must not inherit the German mix.
    expect(gridIntensityFor('scaleway')).toBe(56);
    expect(gridIntensityFor('mistral')).toBe(56);
    expect(gridIntensityFor('litellm')).toBe(350);
  });

  it('falls back to the German mix for an unknown provider', () => {
    // Erring high is the safe direction for a footprint claim.
    expect(gridIntensityFor('some-future-provider')).toBe(350);
  });
});

describe('estimateFootprint', () => {
  it('lands within 10% of the measured energy for a typical answer', () => {
    // Measured: mistral-medium-3.5-128b at 400 output tokens drew 1.8278 Wh.
    const result = estimateFootprint({
      provider: 'mistral',
      model: 'mistral-medium-2604',
      inputTokens: 38,
      outputTokens: 400,
      requests: 1,
    });
    expect(result).not.toBeNull();
    const wh = (result?.energyWms ?? 0) / 3_600_000;
    expect(wh).toBeGreaterThan(1.83 * 0.9);
    expect(wh).toBeLessThan(1.83 * 1.1);
  });

  it('reproduces the measured six-fold gap between Gemma 4 and Mistral Medium', () => {
    const shape = { provider: 'regolo', inputTokens: 600, outputTokens: 400, requests: 1 };
    const gemma = estimateFootprint({ ...shape, model: 'gemma4-31b' });
    const medium = estimateFootprint({ ...shape, model: 'mistral-medium-2604' });
    const ratio = (medium?.energyWms ?? 0) / (gemma?.energyWms ?? 1);
    expect(ratio).toBeGreaterThan(5);
    expect(ratio).toBeLessThan(7);
  });

  it('returns null rather than a guess for a model with no measurement', () => {
    // GreenPT serves no equivalent of the 119b Small or the 122b Qwen, and the
    // series showed size alone does not predict energy. Uncovered is the honest
    // answer; the router reports it as a coverage gap.
    expect(
      estimateFootprint({
        provider: 'regolo',
        model: 'mistral-small-4-119b',
        inputTokens: 5000,
        outputTokens: 200,
        requests: 1,
      })
    ).toBeNull();
    expect(
      estimateFootprint({
        provider: 'regolo',
        model: 'qwen3.5-122b',
        inputTokens: 500,
        outputTokens: 500,
        requests: 1,
      })
    ).toBeNull();
  });

  it('credits back the better PUE of the self-hosted lane', () => {
    // Same Gemma 4 weights, verdigado (Hetzner, PUE 1.13) vs GreenPT's 1.25.
    const shape = { inputTokens: 600, outputTokens: 400, requests: 1 };
    const regolo = estimateFootprint({ ...shape, provider: 'regolo', model: 'gemma4-31b' });
    const verdigado = estimateFootprint({
      ...shape,
      provider: 'litellm',
      model: 'verdigado-think',
    });
    expect((verdigado?.energyWms ?? 0) / (regolo?.energyWms ?? 1)).toBeCloseTo(1.13 / 1.25, 2);
  });

  it('applies the upstream grid, not the lane name', () => {
    // Identical energy, different country: the emissions must differ ~6x.
    const shape = {
      model: 'mistral-medium-2604',
      inputTokens: 600,
      outputTokens: 400,
      requests: 1,
    };
    const fr = estimateFootprint({ ...shape, provider: 'scaleway' });
    const de = estimateFootprint({ ...shape, provider: 'litellm' });
    expect(fr?.energyWms).toBeGreaterThan(0);
    expect((de?.emissionsUg ?? 0) / (fr?.emissionsUg ?? 1)).toBeGreaterThan(5);
  });

  it('charges embeddings on the input side only', () => {
    const result = estimateFootprint({
      provider: 'mistral',
      model: 'mistral-embed',
      inputTokens: 30,
      outputTokens: 0,
      requests: 1,
    });
    // Measured: 8150 Wms for 30 tokens.
    expect(result?.energyWms).toBeGreaterThan(7000);
    expect(result?.energyWms).toBeLessThan(9500);
  });
});
