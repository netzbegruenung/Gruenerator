/**
 * Die vier Regler aus #3118. Geprüft wird dreierlei:
 *
 * 1. dass der Default-Zustand der ausgelieferte ist (Server-Pfad an, `rrf`
 *    seit der Messreihe in Task 8 (2026-09-02), Faktor 1, Gewicht 0,7) —
 *    sonst verstellt dieser PR still die Produktion;
 * 2. dass `HYBRID_SERVER_FUSION` ein GESCHLOSSENER Wertevorrat ist. Ein
 *    `z.string()` würde einen Tippfehler klaglos annehmen und der Suchpfad
 *    fiele auf einen Zweig, den niemand gewählt hat;
 * 3. dass die Regler wirklich bis an `vectorConfig.get('hybrid')` kommen —
 *    das ist die Stelle, an der `hybridSearch.ts` sie liest.
 *
 * Zu 2 und 3 wird `env.ts` per `vi.resetModules()` neu geladen: das Modul
 * parst `process.env` beim Import (`env.ts:510`, `safeParse` + `throw`), einmal
 * je Prozess. Ohne `resetModules` misst der Test den Zustand beim Start der
 * Datei.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import { HYBRID_SERVER_FUSIONS } from './env.js';
import { vectorConfig } from './vectorConfig.js';

const KEYS = [
  'HYBRID_SERVER_SIDE_ENABLED',
  'HYBRID_SERVER_FUSION',
  'HYBRID_SERVER_SPARSE_FACTOR',
  'HYBRID_SERVER_RRF_WEIGHT_DENSE',
  'HYBRID_SERVER_SCORE_JOIN',
] as const;

const original = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));

afterEach(() => {
  for (const key of KEYS) {
    const value = original[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  vi.resetModules();
});

describe('HYBRID_SERVER_* defaults', () => {
  it('liefert den ausgelieferten Zustand an vectorConfig', () => {
    const hybrid = vectorConfig.get('hybrid');
    expect(hybrid.serverSideEnabled).toBe(true);
    expect(hybrid.serverFusion).toBe('rrf');
    expect(hybrid.serverSparseFactor).toBe(1.0);
    expect(hybrid.serverRrfWeightDense).toBe(0.7);
    // Der Cast in getHybridConfig() (hybridSearch.ts:39-41) merkt ein
    // fehlendes Feld nicht — es wäre zur Laufzeit `undefined` und der Join
    // still aus. Diese Zeile ist das einzige Prüfmittel dagegen.
    expect(hybrid.serverScoreJoin).toBe(true);
  });

  it('führt genau die fünf Arme der Spec', () => {
    expect([...HYBRID_SERVER_FUSIONS]).toEqual([
      'rrf',
      'rrf_weighted',
      'dbsf',
      'dense_rescore',
      'sparse_only',
    ]);
  });
});

describe('HYBRID_SERVER_FUSION ist ein geschlossener Wertevorrat', () => {
  it('weist einen unbekannten Armnamen beim Laden zurück', async () => {
    process.env.HYBRID_SERVER_FUSION = 'rrf_weigthed'; // Tippfehler mit Absicht
    vi.resetModules();
    await expect(import('./env.js')).rejects.toThrow('Invalid environment variables');
  });

  it('nimmt jeden Armnamen aus der Registry an', async () => {
    for (const arm of HYBRID_SERVER_FUSIONS) {
      process.env.HYBRID_SERVER_FUSION = arm;
      vi.resetModules();
      const { env } = await import('./env.js');
      expect(env.HYBRID_SERVER_FUSION).toBe(arm);
    }
  });
});

describe('Zahlen-Regler', () => {
  it('liest Faktor und Gewicht als Zahlen, nicht als Strings', async () => {
    process.env.HYBRID_SERVER_SPARSE_FACTOR = '3';
    process.env.HYBRID_SERVER_RRF_WEIGHT_DENSE = '0.3';
    vi.resetModules();
    const { env } = await import('./env.js');
    expect(env.HYBRID_SERVER_SPARSE_FACTOR).toBe(3);
    expect(env.HYBRID_SERVER_RRF_WEIGHT_DENSE).toBe(0.3);
  });

  it('nimmt 0 als Faktor an — das ist der dicht-nur-Kontrollarm, kein Fehler', async () => {
    process.env.HYBRID_SERVER_SPARSE_FACTOR = '0';
    vi.resetModules();
    const { env } = await import('./env.js');
    expect(env.HYBRID_SERVER_SPARSE_FACTOR).toBe(0);
  });
});
