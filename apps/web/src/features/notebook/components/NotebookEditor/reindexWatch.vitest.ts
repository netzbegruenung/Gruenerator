import { describe, expect, it } from 'vitest';

import { settleReindex, splitTimedOut } from './reindexWatch';

describe('settleReindex', () => {
  it('trennt laufende, gescheiterte, alte-Fassung-behalten und fertige Quellen', () => {
    const result = settleReindex(
      ['a', 'b', 'c', 'd', 'e', 'gone'],
      [
        { id: 'a', status: 'uploaded' },
        { id: 'b', status: 'processing' },
        { id: 'c', status: 'failed', processing_error: 'Neu indexieren fehlgeschlagen: x' },
        { id: 'd', status: 'completed', processing_error: 'Neu indexieren fehlgeschlagen: y' },
        { id: 'e', status: 'completed', processing_error: null },
      ]
    );
    expect(result).toEqual({
      running: ['a', 'b'],
      failed: [['c', 'Neu indexieren fehlgeschlagen: x']],
      keptOld: ['Neu indexieren fehlgeschlagen: y'],
      done: ['e'],
    });
  });
});

describe('splitTimedOut', () => {
  it('gibt Quellen nach dem Limit auf, jüngere laufen weiter', () => {
    const started = new Map([
      ['alt', 0],
      ['neu', 10 * 60_000],
    ]);
    expect(splitTimedOut(['alt', 'neu', 'ohne'], started, 16 * 60_000)).toEqual({
      timedOut: ['alt'],
      running: ['neu', 'ohne'],
    });
  });
});
