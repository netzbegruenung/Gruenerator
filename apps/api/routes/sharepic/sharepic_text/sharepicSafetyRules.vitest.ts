import { describe, it, expect } from 'vitest';

import { SHAREPIC_SAFETY_RULES } from './unifiedHandler.js';

/**
 * The rule block mixes two kinds of constraint, and the whole B3 defect was
 * that they shared ONE enforcement mechanism: a layout limit ("the template has
 * no field for a source line") was announced through the refusal channel, so
 * "recherchiere X und mach einen Post mit Quellenangabe" came back as a refusal
 * about fabricated quotes.
 *
 * These assertions pin the SEPARATION, not the wording — a future edit is free
 * to rephrase, but not to move the source-line rule back under the clause that
 * triggers a decline.
 */
describe('SHAREPIC_SAFETY_RULES', () => {
  const [integrityBlock, layoutBlock] = SHAREPIC_SAFETY_RULES.split(/^LAYOUT\b/m);

  it('splits into an integrity block and a layout block', () => {
    expect(integrityBlock).toBeTruthy();
    expect(layoutBlock).toBeTruthy();
  });

  it('keeps the decline instruction in the integrity block only', () => {
    expect(integrityBlock).toContain('ABLEHNUNG:');
    expect(layoutBlock).not.toContain('ABLEHNUNG:');
  });

  it('states the source-line limit as a layout rule, never as a decline reason', () => {
    // The exact sentence the model quoted back when it refused.
    expect(integrityBlock).not.toMatch(/Quellen-, Autor/);
    expect(layoutBlock).toMatch(/Quellen-, Autor/);
    expect(layoutBlock).toMatch(/STILL WEG/);
    expect(layoutBlock).toMatch(/NIEMALS ab/);
  });

  it('still carries all three integrity rules', () => {
    expect(integrityBlock).toMatch(/Erfinde NIEMALS Zitate/);
    expect(integrityBlock).toMatch(/Lege NIEMALS einer real existierenden Person/);
    expect(integrityBlock).toMatch(/herabsetzen/);
  });
});
