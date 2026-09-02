/**
 * Die zwei Regler des Evidenz-Hinweises (#3140). Geprüft wird dreierlei:
 *
 * 1. dass der ausgelieferte Zustand DUNKEL ist — `ENABLED=false` ist die
 *    Bauform dieses PRs, nicht ein Vergessen;
 * 2. dass die Schwelle ein Kosinus-Wertebereich ist: ausserhalb von [0, 1]
 *    bricht der Prozess beim Laden ab, statt eine Zahl anzunehmen, die auf
 *    keinem Signal je vorkommt;
 * 3. dass `boolFlag` NUR die Zeichenkette "true" annimmt — `=1` ist false,
 *    lautlos. Wer das nicht weiss, schaltet das Ereignis "an" und misst nichts.
 *
 * `env.ts` parst `process.env` beim Import, einmal je Prozess. Deshalb wird es
 * für jeden Zweig per `vi.resetModules()` neu geladen; ohne das misst der Test
 * den Zustand beim Start der Datei. Vorbild: `hybridServerFlags.vitest.ts`.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

const KEYS = ['NOTEBOOK_EVIDENCE_WEAK_THRESHOLD', 'NOTEBOOK_EVIDENCE_WEAK_ENABLED'] as const;

const original = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));

afterEach(() => {
  for (const key of KEYS) {
    const value = original[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  vi.resetModules();
});

describe('NOTEBOOK_EVIDENCE_WEAK_* — ausgelieferter Zustand', () => {
  it('liefert dunkel aus: Schwelle 0,9356, Ereignis abgeschaltet', async () => {
    for (const key of KEYS) delete process.env[key];
    vi.resetModules();
    const { env } = await import('./env.js');
    expect(env.NOTEBOOK_EVIDENCE_WEAK_THRESHOLD).toBe(0.9356);
    expect(env.NOTEBOOK_EVIDENCE_WEAK_ENABLED).toBe(false);
  });
});

describe('Die Schwelle ist ein Kosinus, kein beliebiger Wert', () => {
  it('liest sie als Zahl, nicht als Zeichenkette', async () => {
    process.env.NOTEBOOK_EVIDENCE_WEAK_THRESHOLD = '0.9287';
    vi.resetModules();
    const { env } = await import('./env.js');
    expect(env.NOTEBOOK_EVIDENCE_WEAK_THRESHOLD).toBe(0.9287);
  });

  it('weist einen Wert über 1 beim Laden zurück', async () => {
    process.env.NOTEBOOK_EVIDENCE_WEAK_THRESHOLD = '89';
    vi.resetModules();
    await expect(import('./env.js')).rejects.toThrow('Invalid environment variables');
  });

  it('weist einen negativen Wert beim Laden zurück', async () => {
    process.env.NOTEBOOK_EVIDENCE_WEAK_THRESHOLD = '-0.1';
    vi.resetModules();
    await expect(import('./env.js')).rejects.toThrow('Invalid environment variables');
  });
});

describe('Der Schalter kennt genau eine wahre Zeichenkette', () => {
  it('schaltet auf "true" an', async () => {
    process.env.NOTEBOOK_EVIDENCE_WEAK_ENABLED = 'true';
    vi.resetModules();
    const { env } = await import('./env.js');
    expect(env.NOTEBOOK_EVIDENCE_WEAK_ENABLED).toBe(true);
  });

  it('bleibt bei "1" aus — die Falle von boolFlag', async () => {
    process.env.NOTEBOOK_EVIDENCE_WEAK_ENABLED = '1';
    vi.resetModules();
    const { env } = await import('./env.js');
    expect(env.NOTEBOOK_EVIDENCE_WEAK_ENABLED).toBe(false);
  });
});
