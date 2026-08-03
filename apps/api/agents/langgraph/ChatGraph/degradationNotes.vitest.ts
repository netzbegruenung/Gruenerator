import { describe, it, expect } from 'vitest';

import { renderDegradationNotes } from './types.js';

/**
 * A warning event is telemetry — it does not stop the model from presenting a
 * degraded turn as a complete one. These notes are what makes the ANSWER own up
 * to the failure.
 */

describe('renderDegradationNotes', () => {
  it('renders nothing when the turn was clean', () => {
    expect(renderDegradationNotes([])).toBe('');
    expect(renderDegradationNotes(undefined)).toBe('');
  });

  it('lists every hint and forbids claiming success', () => {
    const block = renderDegradationNotes([
      { code: 'compute_failed', modelHint: 'Die Berechnung ist fehlgeschlagen.' },
      { code: 'source_unavailable', modelHint: 'Die Quelle X war nicht erreichbar.' },
    ]);

    expect(block).toContain('Die Berechnung ist fehlgeschlagen.');
    expect(block).toContain('Die Quelle X war nicht erreichbar.');
    expect(block).toContain('transparent');
    expect(block).toMatch(/erfinde keine Ergebnisse/i);
  });
});
