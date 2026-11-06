import { describe, it, expect, vi, beforeEach } from 'vitest';

import {
  LOOP_PLANNER_PRIMARY,
  LOOP_PLANNER_SPEED,
  LOOP_PLANNER_HEALTHY_ALT,
  LOOP_PLANNER_FALLBACK,
  LOOP_PLANNER_UNCONFIGURED,
} from './autoPolicy.js';

/**
 * Die Ausweichkette der Planer-Lane.
 *
 * Warum gemockt statt gegen die echte Umgebung: die Wahl hängt an
 * konfigurierten Schlüsseln. Lokal (`.env` mit allen Anbietern) und in der CI
 * (keiner) prüfte derselbe Test sonst zwei verschiedene Zweige — und die CI
 * ausgerechnet den, in dem die Kette gar nicht ausweichen KANN, weil nur die
 * letzte Stufe übrig ist. Beide Türen sind hier gestellt, der Zweig ist in
 * jeder Umgebung derselbe.
 *
 * Der Vorfall dahinter (28.08.2026): die Kette fragte nur nach der
 * Konfiguration. Eine Lane, die annimmt und dann schweigt, IST konfiguriert —
 * sie blieb also nach dem Stillstand erste Wahl, und jeder folgende Zug wartete
 * dieselben 45 s ab.
 */

// Die Getter lesen die Schlüssel beim Import; ohne sie tauscht `getModel` die
// Lane gegen Mistral (oder wirft), und die Kette wäre nicht ablesbar.
vi.hoisted(() => {
  for (const key of ['MELIOUS_API_KEY', 'CORTECS_API_KEY', 'GREENPT_API_KEY']) {
    process.env[key] = 'test';
  }
});

const configured = new Set<string>();
const slow = new Set<string>();

vi.mock('../../../services/ai/providerInstances.js', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, isProviderConfigured: (p: string) => configured.has(p) };
});

vi.mock('../../../services/ai/modelHealth.js', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, isModelSlow: (p: string, m: string) => slow.has(`${p}/${m}`) };
});

const { loopPlannerModelName, getLoopPlannerFallbackStages } = await import('./providers.js');

const markSlow = (stage: { provider: string; model: string }): void => {
  slow.add(`${stage.provider}/${stage.model}`);
};

describe('loop planner fallback chain', () => {
  beforeEach(() => {
    configured.clear();
    slow.clear();
    for (const p of ['melious', 'cortecs', 'greenpt', 'mistral']) configured.add(p);
  });

  it('nimmt den Primär, solange er gesund ist', () => {
    expect(loopPlannerModelName()).toBe(LOOP_PLANNER_PRIMARY.model);
  });

  it('weicht auf :speed aus, sobald :balanced als zäh vermerkt ist (#5399)', () => {
    markSlow(LOOP_PLANNER_PRIMARY);
    expect(loopPlannerModelName()).toBe(LOOP_PLANNER_SPEED.model);
  });

  it('nimmt Cortecs, wenn beide Melious-Flavors zäh sind', () => {
    markSlow(LOOP_PLANNER_PRIMARY);
    markSlow(LOOP_PLANNER_SPEED);
    expect(loopPlannerModelName()).toBe(LOOP_PLANNER_HEALTHY_ALT.model);
  });

  it('nimmt Mistral, wenn Melious und Cortecs zäh sind', () => {
    markSlow(LOOP_PLANNER_PRIMARY);
    markSlow(LOOP_PLANNER_SPEED);
    markSlow(LOOP_PLANNER_HEALTHY_ALT);
    expect(loopPlannerModelName()).toBe(LOOP_PLANNER_FALLBACK.model);
  });

  it('nimmt Cortecs, wenn Melious nicht konfiguriert ist', () => {
    configured.delete('melious');
    expect(loopPlannerModelName()).toBe(LOOP_PLANNER_HEALTHY_ALT.model);
  });

  it('kein GreenPT als Planer: es ignoriert einen erzwungenen tool_choice (#5113)', () => {
    for (const s of [
      LOOP_PLANNER_PRIMARY,
      LOOP_PLANNER_SPEED,
      LOOP_PLANNER_HEALTHY_ALT,
      LOOP_PLANNER_FALLBACK,
    ]) {
      expect(s.provider).not.toBe('greenpt');
    }
  });

  it('nimmt lieber eine zähe Lane als gar keine', () => {
    // Alle vermerkt: ein zäher Planer ist immer noch ein Planer, und ohne
    // diesen Zweig stünde der agentische Zug ganz ohne Werkzeugphase da.
    for (const s of [
      LOOP_PLANNER_PRIMARY,
      LOOP_PLANNER_SPEED,
      LOOP_PLANNER_HEALTHY_ALT,
      LOOP_PLANNER_FALLBACK,
    ]) {
      markSlow(s);
    }
    expect(loopPlannerModelName()).toBe(LOOP_PLANNER_PRIMARY.model);
  });

  it('landet auf der schlüssellosen Stufe, wenn nichts konfiguriert ist', () => {
    // Der Zweig, der am 14.08.2026 jeden agentischen Zug tötete: eine Stufe,
    // deren Getter ohne Schlüssel wirft, darf hier nicht stehen.
    configured.clear();
    expect(loopPlannerModelName()).toBe(LOOP_PLANNER_UNCONFIGURED.model);
  });
});

describe('Ausweich-Lanes innerhalb eines Zuges', () => {
  const ids = (stages: ReturnType<typeof getLoopPlannerFallbackStages>) =>
    stages.map((s) => `${s.provider}/${s.model}`);
  const id = (s: { provider: string; model: string }) => `${s.provider}/${s.model}`;
  const behind = (s: { provider: string; model: string }, wire: string | null = null) =>
    ids(getLoopPlannerFallbackStages(s.provider as 'melious', s.model, wire));

  beforeEach(() => {
    configured.clear();
    slow.clear();
    for (const p of ['melious', 'cortecs', 'greenpt', 'mistral']) configured.add(p);
  });

  it('hinter :balanced: :speed, dann Cortecs, dann Mistral', () => {
    expect(behind(LOOP_PLANNER_PRIMARY)).toEqual([
      id(LOOP_PLANNER_SPEED),
      id(LOOP_PLANNER_HEALTHY_ALT),
      id(LOOP_PLANNER_FALLBACK),
    ]);
  });

  it('ging der Primär auf dem Draht schon an :speed, fällt die :speed-Stufe weg', () => {
    // Die Falle aus #5399: `meliousWireModel` macht einen grossen
    // `:balanced`-Body zu `:speed` — die Stufe wiederholte dieselbe Anfrage.
    expect(behind(LOOP_PLANNER_PRIMARY, LOOP_PLANNER_SPEED.model)).toEqual([
      id(LOOP_PLANNER_HEALTHY_ALT),
      id(LOOP_PLANNER_FALLBACK),
    ]);
  });

  it('hinter Cortecs nur noch Mistral, hinter der letzten Stufe nichts', () => {
    expect(behind(LOOP_PLANNER_HEALTHY_ALT)).toEqual([id(LOOP_PLANNER_FALLBACK)]);
    expect(behind(LOOP_PLANNER_FALLBACK)).toEqual([]);
  });

  it('lässt zähe und unkonfigurierte Stufen aus', () => {
    markSlow(LOOP_PLANNER_HEALTHY_ALT);
    expect(behind(LOOP_PLANNER_PRIMARY)).toEqual([
      id(LOOP_PLANNER_SPEED),
      id(LOOP_PLANNER_FALLBACK),
    ]);
    markSlow(LOOP_PLANNER_SPEED);
    configured.delete('mistral');
    expect(behind(LOOP_PLANNER_PRIMARY)).toEqual([]);
  });
});
