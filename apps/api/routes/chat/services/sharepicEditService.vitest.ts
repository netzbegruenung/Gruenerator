import { describe, it, expect } from 'vitest';

import { appendRejectedOpsNote } from './sharepicEditService.js';

const reply =
  'Den CTA auf „Kostenlos anmelden" aktualisiert und den Hintergrund zu hellem Creme geändert.';

describe('appendRejectedOpsNote', () => {
  it('leaves a fully applied edit alone', () => {
    expect(appendRejectedOpsNote(reply, [])).toBe(reply);
  });

  it('names what did NOT land when only part of the edit applied', () => {
    // The live case: set-text applied, set-background-color was rejected by the
    // template — and the reply claimed both.
    const out = appendRejectedOpsNote(reply, [
      {
        kind: 'set-background-color',
        reason: 'Operation "set-background-color" wird von dreizeilen-overlay-at nicht unterstützt',
      },
    ]);

    expect(out.startsWith(reply)).toBe(true);
    expect(out).toContain('Nicht übernommen');
    expect(out).toContain('dreizeilen-overlay-at');
  });

  it('collapses duplicate reasons', () => {
    const out = appendRejectedOpsNote(reply, [
      { kind: 'set-background-color', reason: 'Vorlage unterstützt das nicht' },
      { kind: 'set-element-color', reason: 'Vorlage unterstützt das nicht' },
    ]);

    expect(out.match(/Vorlage unterstützt das nicht/g)).toHaveLength(1);
  });
});
