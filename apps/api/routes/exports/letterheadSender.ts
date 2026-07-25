/**
 * Absender for the PDF letterhead.
 *
 * Three sources, in this order:
 *  1. an explicit `letterheadId` — one of the caller's saved letterheads,
 *  2. inline values typed in the export dialog (not saved),
 *  3. the caller's default letterhead.
 *
 * The NAME always comes from the profile, never from the request: the saved
 * fields carry organisation and address only, so there is one answer to "whose
 * letter is this" and no way to sign as somebody else.
 *
 * Returns null when there is nothing worth printing — the renderer then draws
 * no Absender block, and the caller decides whether that is an error.
 */

import { createLogger } from '../../utils/logger.js';

import type { PdfSender } from '../../services/pdf/pdfRenderer.js';

const log = createLogger('LetterheadSender');

export interface LetterheadSelection {
  /** One of the caller's saved letterheads. */
  letterheadId?: string | undefined;
  /** Typed in the dialog for this export only. */
  inline?: { organization?: string | undefined; address?: string | undefined } | undefined;
}

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

export async function resolveLetterheadSender(
  userId?: string,
  selection: LetterheadSelection = {}
): Promise<PdfSender | null> {
  if (!userId) return null;
  try {
    // Lazy so importing this module does not drag the DB layer into unrelated
    // test harnesses (same reason as resolveSharepicAuthorName).
    const { getProfileService } = await import('../../services/user/ProfileService.js');
    const profile = await getProfileService().getProfileById(userId);
    if (!profile) return null;

    let organization = (selection.inline?.organization ?? '').trim();
    let address = (selection.inline?.address ?? '').trim();

    if (!organization && !address) {
      const { getDefaultLetterhead, getLetterhead } =
        await import('../../services/user/letterheadRepository.js');
      // Scoped by userId inside the repository, so a guessed id resolves to
      // null rather than someone else's Absender.
      const row = selection.letterheadId
        ? await getLetterhead(userId, selection.letterheadId)
        : await getDefaultLetterhead(userId);
      organization = (row?.organization ?? '').trim();
      address = (row?.address ?? '').trim();
    }

    const name = senderName(profile);
    if (!name && !organization && !address) return null;

    return {
      ...(name && { name }),
      ...(organization && { organization }),
      ...(address && { address }),
    };
  } catch (err) {
    // A profile or letterhead read failure must never turn a PDF download
    // into a 500.
    log.warn(`Failed to resolve letterhead sender for ${userId}:`, err);
    return null;
  }
}
