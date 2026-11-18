/**
 * Intent Pipeline Integration Tests
 *
 * Verifies that all SearchIntent values are consistently wired across:
 * - Backend types (SearchIntent union, ImageStyle union)
 * - SSE helpers (INTENT_MESSAGE_POOLS, PROGRESS_MESSAGES)
 * - ChatGraph routing (intentToToolKey, routeAfterClassification)
 * - Controller (TOOL_PRIORITY for forced tools)
 * - Frontend types (SearchIntent, GeneratedImage.style, styleLabels)
 * - Mentionables (tool entries map to valid intents)
 *
 * Run with: pnpm --filter @gruenerator/api test
 */

import { searchIntentSchema } from '@gruenerator/contracts';
import { describe, it, expect } from 'vitest';

import {
  INTENT_MESSAGE_POOLS,
  getIntentMessage,
} from '../../../routes/chat/services/sseHelpers.js';

import { INTENT_HANDLER_PATHS } from './intentHandlerPaths.js';
import type { SearchIntent, ConfirmActionType } from './types.js';

// ============================================================================
// Helpers
// ============================================================================

/**
 * All SearchIntent values that must be supported across the stack.
 *
 * Read from the Zod enum, NOT hand-written. This is the file whose job is to
 * catch an intent nobody wired up — and it used to keep its own copy of the
 * list, so an intent added to `searchIntentSchema` and nowhere else was
 * invisible to every test here. Exactly the duplication these tests exist to
 * find, one level up.
 *
 * The usual backstop does not apply either: `apps/api/tsconfig.json` excludes
 * `**` + `/*.vitest.ts`, so the `Record<SearchIntent, …>` maps below are never
 * seen by `pnpm typecheck`. The runtime loop over this array is the only
 * enforcement there is, which makes where it comes from load-bearing.
 */
const ALL_INTENTS: SearchIntent[] = [...searchIntentSchema.options];

// ============================================================================
// 1. Type-Level Consistency
// ============================================================================

describe('SearchIntent type consistency', () => {
  it('INTENT_MESSAGE_POOLS has a non-empty pool for every SearchIntent', () => {
    for (const intent of ALL_INTENTS) {
      const pool = INTENT_MESSAGE_POOLS[intent];
      expect(pool, `Missing INTENT_MESSAGE_POOLS entry for "${intent}"`).toBeDefined();
      expect(Array.isArray(pool)).toBe(true);
      expect(pool.length).toBeGreaterThan(0);
      for (const message of pool) {
        expect(typeof message).toBe('string');
        expect(message.length).toBeGreaterThan(0);
      }
    }
  });

  it('INTENT_MESSAGE_POOLS has no extra entries beyond SearchIntent', () => {
    const intentKeys = Object.keys(INTENT_MESSAGE_POOLS);
    for (const key of intentKeys) {
      expect(
        ALL_INTENTS.includes(key as SearchIntent),
        `INTENT_MESSAGE_POOLS has unexpected key "${key}" not in SearchIntent`
      ).toBe(true);
    }
  });

  it('getIntentMessage returns a string for every intent', () => {
    for (const intent of ALL_INTENTS) {
      const message = getIntentMessage(intent);
      expect(typeof message).toBe('string');
      expect(message.length).toBeGreaterThan(0);
    }
  });

  it('getIntentMessage returns fallback for unknown intent', () => {
    const message = getIntentMessage('nonexistent' as SearchIntent);
    expect(message).toBe('Verarbeite Anfrage...');
  });
});

// ============================================================================
// 5. Intent ↔ Image-related Intents
// ============================================================================

describe('image-related intents', () => {
  it('image and image_edit are distinct intents', () => {
    const imageIntents = ALL_INTENTS.filter((i) => i.startsWith('image'));
    expect(imageIntents).toContain('image');
    expect(imageIntents).toContain('image_edit');
    expect(imageIntents.length).toBe(2);
  });

  it('INTENT_MESSAGE_POOLS differentiates image vs image_edit', () => {
    const imagePool = INTENT_MESSAGE_POOLS['image'];
    const imageEditPool = INTENT_MESSAGE_POOLS['image_edit'];
    const overlap = imagePool.filter((m) => imageEditPool.includes(m));
    expect(overlap, 'image and image_edit pools must not share a phrase').toEqual([]);
  });

  it('image_edit pool mentions editing', () => {
    expect(
      INTENT_MESSAGE_POOLS['image_edit'].some((m) => m.toLowerCase().includes('bearbeit'))
    ).toBe(true);
  });

  it('image pool mentions generation', () => {
    expect(INTENT_MESSAGE_POOLS['image'].some((m) => m.toLowerCase().includes('generier'))).toBe(
      true
    );
  });
});

// ============================================================================
// 6. INTENT_MESSAGE_POOLS are in German
// ============================================================================

describe('INTENT_MESSAGE_POOLS are German user-facing strings', () => {
  it('all messages end with "..." (ellipsis pattern)', () => {
    for (const [intent, pool] of Object.entries(INTENT_MESSAGE_POOLS)) {
      for (const message of pool) {
        expect(
          message.endsWith('...'),
          `INTENT_MESSAGE_POOLS["${intent}"] entry "${message}" should end with "..."`
        ).toBe(true);
      }
    }
  });

  it('no message is empty or just whitespace', () => {
    for (const [intent, pool] of Object.entries(INTENT_MESSAGE_POOLS)) {
      for (const message of pool) {
        expect(
          message.trim().length > 3,
          `INTENT_MESSAGE_POOLS["${intent}"] entry is too short: "${message}"`
        ).toBe(true);
      }
    }
  });
});

// ============================================================================
// 7. SearchIntent Coverage: every intent has a handler path
// ============================================================================

describe('every SearchIntent has a handler path', () => {
  /**
   * Die Karte selbst steht in `intentHandlerPaths.ts` und wird dort vom
   * Compiler geprüft — hier war ihr `Record<SearchIntent, string>` Dekoration,
   * weil `apps/api/tsconfig.json` `*.vitest.ts` ausschliesst.
   *
   * Diese Schleife bleibt trotzdem: sie ist der Ort, an dem die Zusicherung
   * LESBAR ist, und sie wird wieder scharf, sollte die Karte je auf `Partial`
   * oder `Record<string, string>` fallen.
   */
  for (const intent of ALL_INTENTS) {
    it(`"${intent}" has a documented handler path`, () => {
      expect(
        INTENT_HANDLER_PATHS[intent],
        `Intent "${intent}" has no documented handler path — add it to the controller`
      ).toBeDefined();
    });
  }
});

// ============================================================================
// 7b. Create intents: failure policy (drift guard)
// ============================================================================

/**
 * A create_* intent that degrades into the generic respond pipeline lets the
 * responder invent workarounds ("copy it into the Office app and export as
 * PDF") — that prose gets persisted and the next referential turn builds the
 * artifact FROM it. So every create intent needs an EXPLICIT failure policy:
 *
 *  - 'typed'       → the handler owns the turn and reports a templated error
 *  - 'fallthrough' → deliberately hands the turn back (documented reason)
 *
 * Behaviour is pinned in createIntentFailure.vitest.ts; this table exists so a
 * NEW create intent cannot be added without choosing a policy.
 */
describe('every create intent declares a failure policy', () => {
  const CREATE_INTENT_FAILURE_POLICY: Record<string, 'typed' | 'fallthrough'> = {
    create_sheet: 'typed',
    create_presentation: 'typed',
    create_pdf: 'typed',
    create_explainable: 'typed',
    // Retired (09/2026): nothing produces the verdict any more — a recurring
    // order is `agentic` with the `recurring_tasks` tool pinned. The row stays
    // because the enum value stays; a stale verdict from an old thread has no
    // handler and simply hands the turn back.
    create_recurring_task: 'fallthrough',
  };

  const createIntents = ALL_INTENTS.filter((i) => i.startsWith('create_'));

  it('covers every create_* intent in the SearchIntent union', () => {
    for (const intent of createIntents) {
      expect(
        CREATE_INTENT_FAILURE_POLICY[intent],
        `Create intent "${intent}" has no failure policy. Pick 'typed' (own the turn, report a templated error via failCreation) or 'fallthrough' (and document why the responder may take over).`
      ).toBeDefined();
    }
  });

  it('defaults to typed — fall-through must stay the rare, argued exception', () => {
    const fallthrough = Object.entries(CREATE_INTENT_FAILURE_POLICY)
      .filter(([, policy]) => policy === 'fallthrough')
      .map(([intent]) => intent);

    expect(fallthrough).toEqual(['create_recurring_task']);
  });
});

// ============================================================================
// 8. Action-related Intents
// ============================================================================

describe('action-related intents', () => {
  const ACTION_INTENTS: SearchIntent[] = ['save_as_doc', 'modify_doc', 'modify_board'];

  it('all action intents are in ALL_INTENTS', () => {
    for (const intent of ACTION_INTENTS) {
      expect(ALL_INTENTS).toContain(intent);
    }
  });

  it('action intents have distinct INTENT_MESSAGE_POOLS', () => {
    const allPhrases = ACTION_INTENTS.flatMap((i) => INTENT_MESSAGE_POOLS[i]);
    const unique = new Set(allPhrases);
    expect(unique.size, 'action-intent pools must not share a phrase').toBe(allPhrases.length);
  });

  it('INTENT_MESSAGE_POOLS for action intents are in German', () => {
    for (const intent of ACTION_INTENTS) {
      for (const message of INTENT_MESSAGE_POOLS[intent]) {
        expect(message.endsWith('...')).toBe(true);
      }
    }
  });
});

// ============================================================================
// 9. ConfirmActionType ↔ SearchIntent Consistency
// ============================================================================

describe('ConfirmActionType consistency', () => {
  const ALL_CONFIRM_TYPES: ConfirmActionType[] = ['save_as_doc', 'modify_doc', 'modify_board'];

  it('every ConfirmActionType has a matching SearchIntent', () => {
    for (const type of ALL_CONFIRM_TYPES) {
      expect(ALL_INTENTS).toContain(type);
    }
  });
});
