import { describe, it, expect, vi, beforeEach } from 'vitest';

import {
  LOOP_PLANNER_PRIMARY,
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

const { loopPlannerModelName, getLoopPlannerFallbackModels } = await import('./providers.js');

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

  it('weicht auf Cortecs aus, sobald der Primär als zäh vermerkt ist', () => {
    markSlow(LOOP_PLANNER_PRIMARY);
    expect(loopPlannerModelName()).toBe(LOOP_PLANNER_HEALTHY_ALT.model);
  });

  it('nimmt GreenPT, wenn Melious und Cortecs zäh sind', () => {
    markSlow(LOOP_PLANNER_PRIMARY);
    markSlow(LOOP_PLANNER_HEALTHY_ALT);
    expect(loopPlannerModelName()).toBe(LOOP_PLANNER_FALLBACK.model);
  });

  it('nimmt Cortecs, wenn Melious nicht konfiguriert ist', () => {
    configured.delete('melious');
    expect(loopPlannerModelName()).toBe(LOOP_PLANNER_HEALTHY_ALT.model);
  });

  it('kein Mistral mehr in der Kette, solange eine Stufe konfiguriert ist', () => {
    for (const s of [LOOP_PLANNER_PRIMARY, LOOP_PLANNER_HEALTHY_ALT, LOOP_PLANNER_FALLBACK]) {
      expect(s.provider).not.toBe('mistral');
    }
  });

  it('nimmt lieber eine zähe Lane als gar keine', () => {
    // Alle vermerkt: ein zäher Planer ist immer noch ein Planer, und ohne
    // diesen Zweig stünde der agentische Zug ganz ohne Werkzeugphase da.
    for (const s of [LOOP_PLANNER_PRIMARY, LOOP_PLANNER_HEALTHY_ALT, LOOP_PLANNER_FALLBACK]) {
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
  const ids = (models: ReturnType<typeof getLoopPlannerFallbackModels>) =>
    models.map((m) => (typeof m === 'string' ? m : m.modelId));

  beforeEach(() => {
    configured.clear();
    slow.clear();
    for (const p of ['melious', 'cortecs', 'greenpt', 'mistral']) configured.add(p);
  });

  it('hinter dem Primär: erst Cortecs, dann GreenPT', () => {
    expect(
      ids(getLoopPlannerFallbackModels(LOOP_PLANNER_PRIMARY.provider, LOOP_PLANNER_PRIMARY.model))
    ).toEqual([LOOP_PLANNER_HEALTHY_ALT.model, LOOP_PLANNER_FALLBACK.model]);
  });

  it('hinter Cortecs nur noch GreenPT, hinter der letzten Stufe nichts', () => {
    expect(
      ids(
        getLoopPlannerFallbackModels(
          LOOP_PLANNER_HEALTHY_ALT.provider,
          LOOP_PLANNER_HEALTHY_ALT.model
        )
      )
    ).toEqual([LOOP_PLANNER_FALLBACK.model]);
    expect(
      getLoopPlannerFallbackModels(LOOP_PLANNER_FALLBACK.provider, LOOP_PLANNER_FALLBACK.model)
    ).toEqual([]);
  });

  it('lässt zähe und unkonfigurierte Stufen aus', () => {
    markSlow(LOOP_PLANNER_HEALTHY_ALT);
    expect(
      ids(getLoopPlannerFallbackModels(LOOP_PLANNER_PRIMARY.provider, LOOP_PLANNER_PRIMARY.model))
    ).toEqual([LOOP_PLANNER_FALLBACK.model]);
    configured.delete('greenpt');
    expect(
      getLoopPlannerFallbackModels(LOOP_PLANNER_PRIMARY.provider, LOOP_PLANNER_PRIMARY.model)
    ).toEqual([]);
  });
});
