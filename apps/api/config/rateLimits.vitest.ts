import { describe, expect, it, vi } from 'vitest';

vi.mock('./env.js', () => ({
  env: { ENABLE_RATE_LIMIT_ANALYTICS: false, DISABLE_RATE_LIMITS: false },
}));

import rateLimitConfig from './rateLimits.js';

describe('Bundestag-Limits', () => {
  it('begrenzt den Plan-Endpunkt eigens und großzügiger als die Antwort', () => {
    const { bundestag_plan: plan, bundestag_qa: answer } = rateLimitConfig.resources;
    expect(plan.anonymous!.limit).toBe(0);
    expect(plan.authenticated!.limit).toBeGreaterThan(answer.authenticated!.limit);
  });
});
