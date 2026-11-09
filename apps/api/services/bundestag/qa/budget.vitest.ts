import { describe, expect, it } from 'vitest';

import { laneTarget } from '../../ai/lanes.js';

import {
  READ_CONTEXT_TOKENS_BY_MODEL,
  READ_MAX_OUTPUT_TOKENS,
  estimateTokens,
  readContextTokens,
  readWindowTokens,
} from './budget.js';

describe('Lese-Fenster', () => {
  it('die Lane bundestag_read hat eine Kontext-Zeile (kein stiller Rückfall auf die Vorgabe)', () => {
    const model = laneTarget('bundestag_read').model ?? '';
    expect(Object.keys(READ_CONTEXT_TOKENS_BY_MODEL)).toContain(model);
  });

  it('bundestag_read läuft auf :speed und das Fenster folgt der Lane', () => {
    const model = laneTarget('bundestag_read').model;
    expect(model).toBe('gemma-4-31b:speed');
    expect(readContextTokens(model ?? '')).toBe(128_000);
    expect(readWindowTokens(model ?? '')).toBe(60_000);
  });

  it('Fenster plus Ausgabe-Reserve bleiben im Kontext, auch bei doppelt zu knapper Schätzung', () => {
    for (const [model, ctx] of Object.entries(READ_CONTEXT_TOKENS_BY_MODEL)) {
      expect(readWindowTokens(model) * 2 + READ_MAX_OUTPUT_TOKENS).toBeLessThanOrEqual(ctx);
    }
  });

  it('unbekanntes Modell bekommt ein kleineres Fenster, kein größeres', () => {
    expect(readWindowTokens('unbekannt')).toBeLessThan(readWindowTokens('gemma-4-31b:speed'));
  });
});

describe('estimateTokens', () => {
  it('Prosa ~3,5 Zeichen/Token, Tabellen ~1,5', () => {
    const prose = 'Die Bundesregierung wird aufgefordert, die Förderung zu erhöhen. '.repeat(200);
    const table = '21 | Berlin | 12.345 | 2,3 % | 147 | 41,5\n'.repeat(200);
    const proseRatio = prose.length / estimateTokens(prose);
    const tableRatio = table.length / estimateTokens(table);
    expect(proseRatio).toBeGreaterThan(3);
    expect(proseRatio).toBeLessThan(4.5);
    expect(tableRatio).toBeGreaterThan(1.2);
    expect(tableRatio).toBeLessThan(2);
  });
});
