import { type SharedTemplateShareMode } from '@gruenerator/contracts';

/** What the snapshot canvas says about who may reach the Vorlage. */
export interface SnapshotVisibility {
  share_mode: string | null;
  /** The column `checkDirectAccess` actually reads; kept in lockstep by docsContract. */
  is_public: boolean | null;
}

export type SharedTemplateAccess =
  { kind: 'ok'; shareMode: SharedTemplateShareMode } | { kind: 'needs_login' } | { kind: 'hidden' };

/**
 * Decide what a visitor may see of a link-shared Vorlage.
 *
 * Split out of the router so the rules are testable without a database — they
 * are the whole security surface of the public endpoint, and getting
 * `hidden` vs `needs_login` backwards would either leak a private Vorlage or
 * make a public link ask for an account.
 *
 * `hidden` deliberately means 404, not 403: a stranger poking at ids should not
 * learn that a private Vorlage exists under one of them.
 */
export function resolveSharedTemplateAccess(
  snapshot: SnapshotVisibility,
  { isOwner, isAnonymous }: { isOwner: boolean; isAnonymous: boolean }
): SharedTemplateAccess {
  const isPublicLink = snapshot.share_mode === 'public' || snapshot.is_public === true;
  if (isPublicLink) return { kind: 'ok', shareMode: 'public' };

  if (snapshot.share_mode === 'authenticated') {
    // The link exists but spends an account to open it.
    return isAnonymous ? { kind: 'needs_login' } : { kind: 'ok', shareMode: 'authenticated' };
  }

  // Private: only the owner gets a preview of their own not-yet-shared Vorlage,
  // and they see it under the narrower of the two modes so the page never
  // overstates who else could reach the link.
  if (isOwner) return { kind: 'ok', shareMode: 'authenticated' };
  return { kind: 'hidden' };
}
