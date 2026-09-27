import { describe, expect, it } from 'vitest';

import { parseMeliousImpact } from '../meliousImpact.js';

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
    });
  });

  it('returns null when no usable impact values are present', () => {
    expect(parseMeliousImpact({ environment_impact: {} })).toBeNull();
  });
});
