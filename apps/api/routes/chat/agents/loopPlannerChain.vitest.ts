import { describe, it, expect, vi, beforeEach } from 'vitest';

import {
  LOOP_PLANNER_PRIMARY,
  LOOP_PLANNER_HEALTHY_ALT,
  LOOP_PLANNER_SELFHOSTED,
  LOOP_PLANNER_FALLBACK,
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

const { loopPlannerModelName } = await import('./providers.js');

const markSlow = (stage: { provider: string; model: string }): void => {
  slow.add(`${stage.provider}/${stage.model}`);
};

describe('loop planner fallback chain', () => {
  beforeEach(() => {
    configured.clear();
    slow.clear();
    for (const p of ['greenpt', 'cortecs', 'regolo', 'litellm']) configured.add(p);
  });

  it('nimmt den Primär, solange er gesund ist', () => {
    expect(loopPlannerModelName()).toBe(LOOP_PLANNER_PRIMARY.model);
  });

  it('weicht auf Cortecs aus, sobald der Primär als zäh vermerkt ist', () => {
    markSlow(LOOP_PLANNER_PRIMARY);
    expect(loopPlannerModelName()).toBe(LOOP_PLANNER_HEALTHY_ALT.model);
  });

  it('geht Stufe für Stufe weiter, wenn mehrere Lanes stehen', () => {
    markSlow(LOOP_PLANNER_PRIMARY);
    markSlow(LOOP_PLANNER_HEALTHY_ALT);
    expect(loopPlannerModelName()).toBe(LOOP_PLANNER_SELFHOSTED.model);
  });

  it('überspringt eine Stufe auch dann, wenn sie nur NICHT konfiguriert ist', () => {
    configured.delete('greenpt');
    expect(loopPlannerModelName()).toBe(LOOP_PLANNER_HEALTHY_ALT.model);
  });

  it('nimmt lieber eine zähe Lane als gar keine', () => {
    // Alle vermerkt: ein zäher Planer ist immer noch ein Planer, und ohne
    // diesen Zweig stünde der agentische Zug ganz ohne Werkzeugphase da.
    for (const s of [
      LOOP_PLANNER_PRIMARY,
      LOOP_PLANNER_HEALTHY_ALT,
      LOOP_PLANNER_SELFHOSTED,
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
    expect(loopPlannerModelName()).toBe(LOOP_PLANNER_FALLBACK.model);
  });
});
