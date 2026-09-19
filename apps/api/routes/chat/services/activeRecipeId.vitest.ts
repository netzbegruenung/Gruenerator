/**
 * Die Vorrangregel zwischen dem `skill:`-Token einer Nachricht und der
 * Rezept-Zeile, die der Store nebenher mitschickt.
 *
 * Run with: cd apps/api && npx vitest run routes/chat/services/activeRecipeId.vitest.ts
 */
import { describe, expect, it } from 'vitest';

import { activeRecipeIdForTurn } from './streamContext.js';

const ROW_ID = '11111111-1111-4111-8111-111111111111';

describe('activeRecipeIdForTurn', () => {
  it('pins the row the store chose when the message carries no token', () => {
    expect(activeRecipeIdForTurn(null, ROW_ID)).toBe(ROW_ID);
  });

  it('drops the ambient row id when the message names a recipe itself', () => {
    // Der gemessene Fall: eine bereits getokente Nachricht wird bearbeitet und
    // erneut gesendet. Bliebe die id stehen, schlüge sie die Mention des Tokens
    // und der Turn führe still mit dem Rezept aus dem Store.
    expect(activeRecipeIdForTurn('omveinladungen', ROW_ID)).toBeNull();
  });

  it('answers null — never undefined — when neither side names one', () => {
    expect(activeRecipeIdForTurn(null, null)).toBeNull();
    expect(activeRecipeIdForTurn(null, undefined)).toBeNull();
  });
});
