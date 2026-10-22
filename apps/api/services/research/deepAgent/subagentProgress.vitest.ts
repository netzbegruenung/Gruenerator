import { describe, expect, it } from 'vitest';

import { CUT_SHORT_NOTE, isAbort, subagentLabel } from './subagentProgress.js';

describe('subagentLabel', () => {
  it('names the kind of researcher, not the registry id', () => {
    expect(subagentLabel('web-recherche', 'Wehrpflicht seit 2024')).toBe(
      'Web-Recherche: Wehrpflicht seit 2024'
    );
    expect(subagentLabel('programm-recherche')).toBe('Programm-Recherche');
  });

  it('falls back to the raw name instead of dropping the step', () => {
    expect(subagentLabel('etwas-neues', 'Frage')).toBe('etwas-neues: Frage');
  });

  it('fits a sub-question into a sidebar row', () => {
    const label = subagentLabel('web-recherche', 'W'.repeat(300));

    expect(label.length).toBeLessThanOrEqual('Web-Recherche: '.length + 90);
    expect(label.endsWith('…')).toBe(true);
  });

  it('flattens the newlines a lead writes into its task description', () => {
    expect(subagentLabel('web-recherche', 'Erste Zeile\n  zweite  Zeile')).toBe(
      'Web-Recherche: Erste Zeile zweite Zeile'
    );
  });
});

describe('isAbort', () => {
  it('reads the stop from the name, whatever class carried it', () => {
    expect(isAbort(Object.assign(new Error('x'), { name: 'AbortError' }))).toBe(true);
    expect(isAbort({ name: 'TimeoutError' })).toBe(true);
    expect(isAbort(new Error('503'))).toBe(false);
    expect(isAbort(null)).toBe(false);
  });
});

describe('CUT_SHORT_NOTE', () => {
  it('goes into the label, because the status enum crosses to shipped binaries', () => {
    expect(subagentLabel('web-recherche', 'Frage', CUT_SHORT_NOTE)).toMatch(/Zeit abgelaufen$/);
  });
});
