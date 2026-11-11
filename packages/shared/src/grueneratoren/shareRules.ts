/**
 * Regeln der Freigabe eines eigenen Agents oder Rezepts — eine Quelle für die
 * Dialoge in Web (`ShareAgentModal`, `RecipeSharingPanel`) und Mobile
 * (`SharingControls`). Vorher stand jede Regel zwei- bis dreimal im Code, und
 * die Kopien liefen auseinander.
 */
import { type PublicOwnership } from '@gruenerator/contracts';

import { agentRef, getAgentSlug } from '../agents/slug.js';
import { isApiErrorWithStatus } from '../api/index.js';
import { slugifyName } from '../utils/index.js';

/** Agents und Rezepte teilen dieselben drei Stufen (`userAgentShareModeSchema`,
 * `textFormShareModeSchema`). Die Dialoge zeigen sie nicht mehr, sie leiten sie
 * aus „Projekte" und „Alle mit Anmeldung" ab. */
export type ShareMode = 'private' | 'groups' | 'authenticated';

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
 * Der Pfad, der im Teilen-Dialog steht: `<name>-<slugSuffix>` wie bei Notebooks
 * und Projekten. Der Link ist für jemand anderen — `identifier` und `mention`
 * sind nur pro Person eindeutig und träfen dort den eigenen oder den ältesten
 * gleichnamigen Eintrag. Der Suffix nennt genau eine Zeile und übersteht eine
 * Umbenennung; der Namensteil ist Kosmetik.
 *
 * Ohne Suffix (Zeile von vor der Spalte, alte Clients) bleibt der alte Weg: beim
 * Agent die uuid über `agentRef(…, false)`, beim Rezept die Mention.
 */
export function agentSharePath(agent: {
  id?: string;
  identifier: string;
  title?: string;
  slugSuffix?: string;
}): string {
  const slug = agent.slugSuffix
    ? `${slugifyName(agent.title ?? '', 'agent')}-${agent.slugSuffix}`
    : getAgentSlug(agentRef(agent, false));
  return `/agentura/agent/${encodeURIComponent(slug)}`;
}

export function recipeSharePath(recipe: {
  mention: string;
  title?: string;
  slugSuffix?: string | null;
}): string {
  const slug = recipe.slugSuffix
    ? `${slugifyName(recipe.title ?? '', 'rezept')}-${recipe.slugSuffix}`
    : recipe.mention;
  return `/agentura/rezept/${encodeURIComponent(slug)}`;
}
