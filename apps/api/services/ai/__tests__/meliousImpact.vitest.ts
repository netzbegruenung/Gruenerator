import { beforeEach, describe, expect, it, vi } from 'vitest';

const { recordImpact, recordTokenUsage } = vi.hoisted(() => ({
  recordImpact: vi.fn(),
  recordTokenUsage: vi.fn(),
}));
vi.mock('../../usage/UsageTrackingService.js', () => ({ recordImpact, recordTokenUsage }));
vi.mock('../../../utils/usageContext.js', () => ({
  getUsageUserId: () => 'u1',
  getUsageFeature: () => 'chat',
}));

import {
  captureMeliousImpact,
  meliousBookedProvider,
  parseMeliousImpact,
} from '../meliousImpact.js';

describe('parseMeliousImpact', () => {
  it('converts Melious energy and carbon values to internal units', () => {
    expect(
      parseMeliousImpact({
        environment_impact: {
          energy_kwh: 0.00015,
          carbon_g_co2: 0.06,
        },
        usage: { prompt_tokens: 120, completion_tokens: 30, total_tokens: 150 },
      })
    ).toEqual({
      energyWms: 540_000,
      emissionsUg: 60_000,
      inputTokens: 120,
      outputTokens: 30,
      upstream: null,
    });
  });

  it('names the upstream that served the request', () => {
    const impact = parseMeliousImpact({
      environment_impact: { energy_kwh: 0.0003, carbon_g_co2: 0.0076, provider_id: 'Berget' },
    });
    expect(impact?.upstream).toBe('berget');
    expect(meliousBookedProvider(impact)).toBe('berget');
  });

  it('falls back to the router when the upstream is missing or not a plain id', () => {
    const odd = parseMeliousImpact({
      environment_impact: { energy_kwh: 0.0003, carbon_g_co2: 0.0076, provider_id: '../x' },
    });
    expect(odd?.upstream).toBeNull();
    expect(meliousBookedProvider(odd)).toBe('melious');
    expect(meliousBookedProvider(null)).toBe('melious');
  });

  it('returns null when no usable impact values are present', () => {
    expect(parseMeliousImpact({ environment_impact: {} })).toBeNull();
  });
});

describe('captureMeliousImpact — non-streamed', () => {
  beforeEach(() => {
    recordImpact.mockClear();
    recordTokenUsage.mockClear();
  });

  const json = (body: unknown) =>
    new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });

  it('books tokens and measurement under the upstream', async () => {
    captureMeliousImpact(
      json({
        usage: {
          prompt_tokens: 40,
          completion_tokens: 5,
          prompt_tokens_details: { cached_tokens: 32 },
        },
        environment_impact: { energy_kwh: 0.0003, carbon_g_co2: 0.0076, provider_id: 'berget' },
      }),
      'gemma-4-31b:eco'
    );
    await vi.waitFor(() => expect(recordImpact).toHaveBeenCalledTimes(1));
    expect(recordTokenUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'berget',
        model: 'gemma-4-31b:eco',
        inputTokens: 40,
        outputTokens: 5,
        cachedInputTokens: 32,
      })
    );
    expect(recordImpact).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'berget', emissionsUg: 7600 })
    );
    expect(recordImpact.mock.calls[0][0]).not.toHaveProperty('upstream');
  });

  it('still books the tokens under the router when no measurement came back', async () => {
    captureMeliousImpact(json({ usage: { prompt_tokens: 7, completion_tokens: 2 } }), 'm');
    await vi.waitFor(() => expect(recordTokenUsage).toHaveBeenCalledTimes(1));
    expect(recordTokenUsage).toHaveBeenCalledWith(expect.objectContaining({ provider: 'melious' }));
    expect(recordImpact).not.toHaveBeenCalled();
  });
});
