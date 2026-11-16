/**
 * `gemma` war die Kennung des Verdigado-Proxys für Gemma 4. Der Proxy wird seit
 * dem 29.08.2026 nicht mehr befragt (services/ai/litellmRetired.ts), gespeicherte
 * Auswahlen nennen die Kennung aber weiter — ihre Fähigkeiten bleiben abrufbar.
 */
import { describe, it, expect } from 'vitest';

import { isReasoningCapable, isVisionCapable } from '../modelDiscovery.js';

describe('model metadata — legacy gemma alias', () => {
  it('keeps gemma metadata so a stored choice still reports its capabilities', () => {
    expect(isVisionCapable('gemma')).toBe(true);
    expect(isReasoningCapable('gemma')).toBe(true);
  });
});
