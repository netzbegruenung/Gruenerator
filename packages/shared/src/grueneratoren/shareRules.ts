/**
 * Regeln der Freigabe eines eigenen Agents oder Rezepts — eine Quelle für die
 * Dialoge in Web (`ShareAgentModal`, `RecipeSharingPanel`) und Mobile
 * (`SharingControls`). Vorher stand jede Regel zwei- bis dreimal im Code, und
 * die Kopien liefen auseinander.
 */
import { type PublicOwnership } from '@gruenerator/contracts';

import { agentRef, getAgentSlug } from '../agents/slug.js';
import { isApiErrorWithStatus } from '../api/index.js';

/** Agents und Rezepte teilen dieselben drei Stufen (`userAgentShareModeSchema`, `textFormShareModeSchema`). */
export type ShareMode = 'private' | 'groups' | 'authenticated';

export const SHARE_MODES: readonly ShareMode[] = ['private', 'groups', 'authenticated'];

export const SHARE_MODE_LABELS: Record<ShareMode, string> = {
  private: 'Privat — nur ich',
  groups: 'Mit Projekten geteilt',
  authenticated: 'Mit Anmeldung — alle eingeloggten Nutzer*innen',
};

export const OWNERSHIP_CHOICES: readonly PublicOwnership[] = ['owner', 'public_data'];

export const OWNERSHIP_LABELS: Record<PublicOwnership, { title: string; hint: string }> = {
  owner: {
    title: 'Ich besitze die Inhalte',
    hint: '… oder habe die Rechte zur Veröffentlichung',
  },
  public_data: {
    title: 'Inhalte sind öffentlich verfügbar',
    hint: 'z.B. offizielle Inhalte, Pressematerial',
  },
};

export interface ListingPlan {
  /** Erst auf „Mit Anmeldung" heben — der Server listet nur von dort aus. */
  promote: boolean;
  listing: { is_public: boolean; public_ownership: PublicOwnership | null };
}

/** Ausschalten nimmt die Eigentumsangabe mit. */
export const UNLIST: ListingPlan['listing'] = { is_public: false, public_ownership: null };

/**
 * Was eine Antwort auf die Eigentumsfrage auslöst. Gelistet wird erst damit:
 * das Einschalten des Schalters stellt nur die Frage. Die Angabe ist eine
 * Erklärung der Person — ein vorbelegtes „owner" hätte sie für sie abgegeben.
 */
export function planListing(shareMode: ShareMode, choice: PublicOwnership): ListingPlan {
  return {
    promote: shareMode !== 'authenticated',
    listing: { is_public: true, public_ownership: choice },
  };
}

/**
 * Bei 400/403/409 sagt der Server selbst, was im Weg steht (kein Recht im
 * Projekt, schon geteilt, angepasstes System-Rezept, von der Moderation
 * entfernt). Alles andere ist keine Auskunft für Nutzer*innen und bekommt die
 * Sammelzeile.
 */
export function shareErrorText(error: unknown): string {
  const explained = [400, 403, 409].some((status) => isApiErrorWithStatus(error, status));
  if (explained && error instanceof Error && error.message) return error.message;
  return 'Die Freigabe konnte nicht geändert werden.';
}

/**
 * Der Pfad, der im Teilen-Dialog steht. Immer über `agentRef(…, false)`: der
 * Link ist für jemand anderen, und dessen Liste kennt einen fremden Agent nur
 * per uuid — der `identifier` ist nur pro Person eindeutig und träfe dort den
 * eigenen oder den ältesten gleichnamigen Agent.
 */
export function agentSharePath(agent: { id?: string; identifier: string }): string {
  return `/agentura/agent/${encodeURIComponent(getAgentSlug(agentRef(agent, false)))}`;
}

export function recipeSharePath(mention: string): string {
  return `/agentura/rezept/${encodeURIComponent(mention)}`;
}
