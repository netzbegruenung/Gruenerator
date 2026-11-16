import { describe, expect, it } from 'vitest';

import { ANTRAGSGRUEN_INSTANCES } from '../../../../config/antragsgruenInstances.js';

import { isEnabled } from './ParteitageScraper.js';

import type { ConsultationRef } from './antragsgruenClient.js';

const nrw = ANTRAGSGRUEN_INSTANCES[0];
const ref = (url_path: string) => ({ url_path }) as ConsultationRef;

describe('isEnabled', () => {
  it('NRW führt vorerst nur die LDK Essen', () => {
    expect(isEnabled(nrw, ref('ldk26-02'))).toBe(true);
    expect(isEnabled(nrw, ref('ldk26'))).toBe(false);
    expect(isEnabled(nrw, ref('lpr26'))).toBe(false);
  });

  it('`null` lässt jede Konsultation durch', () => {
    expect(isEnabled({ ...nrw, consultations: null }, ref('lpr26'))).toBe(true);
  });
});
