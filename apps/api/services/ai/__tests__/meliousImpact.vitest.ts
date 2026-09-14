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
      })
    ).toEqual({
      energyWms: 540_000,
      emissionsUg: 60_000,
    });
  });

  it('returns null when no usable impact values are present', () => {
    expect(parseMeliousImpact({ environment_impact: {} })).toBeNull();
  });
});
