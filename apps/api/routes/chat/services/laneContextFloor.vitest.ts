/**
 * Der Boden, gegen den der agentische Pfad kürzt, solange die Lane noch nicht
 * aufgelöst ist.
 *
 * Die eine Zusicherung, die zählt, ist die RICHTUNG: der Boden darf nie grösser
 * sein als das kleinste Fenster, das die gewählte Lane wirklich bedienen kann —
 * zu klein kürzt bloss mehr, zu gross läuft bei Verdigado in eine STILLE
 * Kürzung (HTTP 200, `prompt_tokens` bricht auf ~64Ki ein, nichts sagt es).
 * Deshalb prüft der Tabellentest jede Lane einzeln, statt eine Zahl festzunageln.
 */
import { describe, it, expect } from 'vitest';

import { AVAILABLE_MODELS, getModelConfig } from '../agents/providers.js';

import { resolveLaneContextFloor } from './laneContextFloor.js';

/** Every window a request on this lane could run against. Bis zum 29.08.2026
 *  konnten das ZWEI sein (Verdigado-Primär, Regolo-Überlauf); die Bauform ist
 *  mit dem Host weg — siehe services/ai/litellmRetired.ts. */
function reachableWindows(modelId: string): number[] {
  const config = getModelConfig(modelId);
  if (!config) return [];
  return [config.contextWindow];
}

describe('resolveLaneContextFloor', () => {
  it('bleibt für JEDE Lane unter deren kleinstem erreichbaren Fenster', () => {
    for (const modelId of Object.keys(AVAILABLE_MODELS)) {
      const floor = resolveLaneContextFloor(modelId);
      expect(floor, modelId).not.toBeNull();
      expect(floor, modelId).toBeLessThanOrEqual(Math.min(...reachableWindows(modelId)));
    }
  });

  it('nimmt für auto den Boden über alle Lanes', () => {
    const perLane = Object.keys(AVAILABLE_MODELS).map((id) => resolveLaneContextFloor(id) ?? 0);
    const expected = Math.min(...perLane);
    for (const id of [undefined, null, 'auto', 'mistral']) {
      expect(resolveLaneContextFloor(id), String(id)).toBe(expected);
    }
  });

  it('hebt das alte 32k-Standardfenster tatsächlich an', () => {
    // Der Regressionswert des Befunds: gekürzt wurde gegen 32.768 (→ Budget
    // 19.937), obwohl keine einzige Lane so klein ist.
    expect(resolveLaneContextFloor('auto')).toBeGreaterThan(32_768);
  });

  it('gibt null zurück, wenn die Kennung unbekannt ist', () => {
    expect(resolveLaneContextFloor('gibt-es-nicht')).toBeNull();
  });
});
