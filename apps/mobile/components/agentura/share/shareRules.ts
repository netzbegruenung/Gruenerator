import { type PublicOwnership } from '@gruenerator/contracts';
import { isApiErrorWithStatus } from '@gruenerator/shared/api';

/** Agents und Rezepte teilen dieselben drei Stufen (`userAgentShareModeSchema`, `textFormShareModeSchema`). */
export type ShareMode = 'private' | 'groups' | 'authenticated';

export const SHARE_MODES: readonly ShareMode[] = ['private', 'groups', 'authenticated'];

export const SHARE_MODE_LABELS: Record<ShareMode, string> = {
  private: 'Privat — nur ich',
  groups: 'Mit Projekten geteilt',
  authenticated: 'Mit Anmeldung — alle eingeloggten Nutzer*innen',
};

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

/**
 * Was der „Öffentlich"-Schalter auslöst, wie im Web: Ausschalten nimmt die
 * Eigentumsangabe mit; Einschalten aus einer niedrigeren Stufe hebt zuerst die
 * Sichtbarkeit und listet dann, beim ersten Mal mit „owner".
 */
export function planListingToggle(
  checked: boolean,
  shareMode: ShareMode,
  publicOwnership: PublicOwnership | null
): ListingPlan {
  if (!checked) return { promote: false, listing: { is_public: false, public_ownership: null } };
  return {
    promote: shareMode !== 'authenticated',
    listing: { is_public: true, public_ownership: publicOwnership ?? 'owner' },
  };
}

/**
 * Bei 400/409 sagt der Server selbst, was im Weg steht (etwa, dass angepasste
 * System-Rezepte sich nicht teilen lassen). Alles andere ist keine Auskunft für
 * Nutzer*innen und bekommt die Sammelzeile — wie `RecipeSharingPanel` im Web.
 */
export function shareErrorText(error: unknown): string {
  const explained = isApiErrorWithStatus(error, 400) || isApiErrorWithStatus(error, 409);
  if (explained && error instanceof Error && error.message) return error.message;
  return 'Die Freigabe konnte nicht geändert werden.';
}
