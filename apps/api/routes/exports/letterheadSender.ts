/**
 * Absender for the PDF letterhead, resolved from the CALLER'S OWN profile.
 *
 * Deliberately server-side: the export body carries only a layout choice, never
 * a sender object. A client-supplied sender would let anyone print any name and
 * organisation onto Grünen corporate-identity paper.
 *
 * Returns null when there is no user, no profile, or nothing worth printing —
 * the renderer then draws no Absender block at all, and the caller decides
 * whether that is an error (see the letterhead/letter paths) or fine.
 */

import { createLogger } from '../../utils/logger.js';

import type { PdfSender } from '../../services/pdf/pdfRenderer.js';

const log = createLogger('LetterheadSender');

/** Formal name for a letterhead: "Vorname Nachname", else the display name. */
function senderName(profile: {
  first_name?: string | null | undefined;
  last_name?: string | null | undefined;
  display_name?: string | null | undefined;
}): string {
  const full = [profile.first_name, profile.last_name].filter(Boolean).join(' ').trim();
  // display_name is often an informal first name; the full name wins when set.
  return full || (profile.display_name ?? '').trim();
}

export async function resolveLetterheadSender(userId?: string): Promise<PdfSender | null> {
  if (!userId) return null;
  try {
    // Lazy so importing this module does not drag the DB layer into unrelated
    // test harnesses (same reason as resolveSharepicAuthorName).
    const { getProfileService } = await import('../../services/user/ProfileService.js');
    const profile = await getProfileService().getProfileById(userId);
    if (!profile) return null;

    const name = senderName(profile);
    const organization = (profile.sender_organization ?? '').trim();
    const address = (profile.sender_address ?? '').trim();
    if (!name && !organization && !address) return null;

    return {
      ...(name && { name }),
      ...(organization && { organization }),
      ...(address && { address }),
    };
  } catch (err) {
    // A profile read failure must never turn a PDF download into a 500.
    log.warn(`Failed to resolve letterhead sender for ${userId}:`, err);
    return null;
  }
}
