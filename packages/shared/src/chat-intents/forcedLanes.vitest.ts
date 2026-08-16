import { searchIntentSchema } from '@gruenerator/contracts';
import { describe, expect, it } from 'vitest';

import {
  ALL_CHAT_INTENTS,
  CHAT_INTENTS,
  FORCED_LANE_BY_INTENT,
  forcedLaneOf,
  forcesLoopLane,
  intentsWithForcedLane,
  type ChatIntentId,
} from './index.js';

/**
 * Die Aufzählung, die `decideTurnPlan` vor der Achse als Literal führte
 * (`turnPlan.ts`: `proposedIntent === 'mcp' || … 'umfragen' || … 'hilfe'`).
 * Solange dieses Fixture hält, hat die Einführung der Achse nichts geändert,
 * was ein Turn beobachten könnte. Ein späterer Flip ändert es SICHTBAR, in dem
 * Commit, der ihn vornimmt.
 */
const IS_MCP_TURN_BEFORE = ['mcp', 'umfragen', 'hilfe'] as const;

describe('forcedLane totality', () => {
  it('describes every intent in the wire enum, and no others', () => {
    expect(Object.keys(FORCED_LANE_BY_INTENT).sort()).toEqual(
      [...searchIntentSchema.options].sort()
    );
  });

  it('assigns every intent exactly one of the three lanes', () => {
    const lanes =
      intentsWithForcedLane('loop').size +
      intentsWithForcedLane('single-pass').size +
      intentsWithForcedLane('pipeline').size;
    expect(lanes).toBe(ALL_CHAT_INTENTS.length);
  });

  it('answers null for a non-intent instead of guessing a lane', () => {
    expect(forcedLaneOf('definitiv-kein-intent')).toBeNull();
    expect(forcesLoopLane('definitiv-kein-intent')).toBe(false);
  });
});

describe('the loop lane matches the router enumeration it replaced', () => {
  it('same three intents, no more', () => {
    expect([...intentsWithForcedLane('loop')].sort()).toEqual([...IS_MCP_TURN_BEFORE].sort());
  });

  it('forcesLoopLane agrees with the old literal for every intent', () => {
    const before = new Set<string>(IS_MCP_TURN_BEFORE);
    for (const id of searchIntentSchema.options) {
      expect(forcesLoopLane(id)).toBe(before.has(id));
    }
  });
});

describe('the pipeline lane is exactly the create-route family', () => {
  /**
   * Abgeleitet statt aufgezählt: `createIntentStage` dispatcht auf den
   * `forcedTool`-String eines Artefakt-Intents. Wer einen davon hinzufügt und
   * die Lane vergisst, fällt hier auf — nicht erst, wenn eine Erwähnung still
   * im Einzeldurchlauf landet.
   */
  it('every artifact intent with a create-route key, and nothing else', () => {
    const withCreateRoute = ALL_CHAT_INTENTS.filter(
      (i) => i.category === 'artifact' && i.forcedTool != null
    ).map((i) => i.id);
    expect([...intentsWithForcedLane('pipeline')].sort()).toEqual([...withCreateRoute].sort());
  });

  it('leaves create_recurring_task out — it has no create route to reach', () => {
    const recurring = CHAT_INTENTS.create_recurring_task;
    expect(recurring.category === 'artifact' && recurring.forcedTool).toBeNull();
    expect(forcedLaneOf('create_recurring_task')).toBe('single-pass');
  });
});

describe('the axis covers what a mention can actually pin', () => {
  it('every mentionable intent has a lane', () => {
    for (const intent of ALL_CHAT_INTENTS) {
      if (!('mention' in intent) || !intent.mention) continue;
      expect(forcedLaneOf(intent.id satisfies ChatIntentId)).not.toBeNull();
    }
  });
});
