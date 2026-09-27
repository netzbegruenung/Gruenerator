/**
 * Pure helpers for `userTextFormsContractRouter` — the two decisions that are
 * worth testing without an HTTP layer or a database behind them.
 *
 * Kept out of the router file so a test can import them without pulling in the
 * AI provider instances and the Postgres pool the router's service imports
 * create at module load.
 */

import { textFormTypeSchema } from '@gruenerator/contracts';
import { SKILLS } from '@gruenerator/shared/agents';

import { type TextFormSharingResult } from '../../services/user/textFormRepository.js';

/** What the router answers with when a sharing write did not go through. */
export interface SharingFailure {
  status: 400 | 404 | 409;
  message: string;
}

/**
 * Every mention a drafted recipe must not collide with: the system skills, the
 * four preset text types and the caller's OWN recipes. Recipes that only
 * reached them through a group share are deliberately left out — those live
 * under their owner's account, and the mention stays free here.
 */
export function collectTakenMentions(
  own: ReadonlyArray<{ mention: string; sharedFromGroup: string | null }>
): Set<string> {
  return new Set<string>([
    ...SKILLS.map((s) => s.mention),
    ...textFormTypeSchema.options,
    ...own.filter((f) => !f.sharedFromGroup).map((f) => f.mention),
  ]);
}

/**
 * The repository's sharing verdict as an HTTP answer, or `null` when the write
 * went through. `updated: false` means the owner has no such recipe (404);
 * `not_custom` that it exists but overrides a system recipe, which is not the
 * owner's to hand out (409); `ownership_required` that the patch would list it
 * publicly without the legal attestation (400).
 */
export function sharingFailure(result: TextFormSharingResult): SharingFailure | null {
  if (result.ok) {
    return result.updated ? null : { status: 404, message: 'Rezept nicht gefunden.' };
  }
  if (result.reason === 'not_custom') {
    return {
      status: 409,
      message: 'Angepasste System-Rezepte lassen sich nicht teilen — nur eigene Rezepte.',
    };
  }
  return {
    status: 400,
    message: 'Bitte bestätige die Quelle der Inhalte (Eigentum oder öffentlich).',
  };
}
