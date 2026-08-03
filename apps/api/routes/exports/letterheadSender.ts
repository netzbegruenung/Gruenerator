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
import type { LetterheadDispatchMode } from '@gruenerator/contracts';

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

/**
 * Der Absender UND die Versandoptionen, die an derselben Zeile hängen.
 *
 * Zusammen, weil beides aus einem Datensatz kommt: getrennt zu holen hieße, ihn
 * zweimal zu lesen — und die Optionen dann irgendwo zu vergessen. Genau das war
 * der Fehler, den das hier behebt: der Chat-Pfad kannte nur den Profilnamen und
 * hat den gespeicherten Briefkopf nie gelesen.
 *
 * Inline-Angaben aus dem Export-Dialog tragen keine Optionen — dann gelten die
 * Vorgaben.
 */
export interface LetterheadRenderOptions {
  sender: PdfSender | null;
  dispatchMode: LetterheadDispatchMode;
  returnLine: boolean;
  foldMarks: boolean;
  stationery: { bytes: Buffer; type: 'pdf' | 'png' | 'jpg' } | null;
}

const DEFAULT_OPTIONS: Omit<LetterheadRenderOptions, 'sender'> = {
  dispatchMode: 'fensterkuvert',
  returnLine: true,
  foldMarks: true,
  stationery: null,
};

export async function resolveLetterheadOptions(
  userId?: string,
  selection: LetterheadSelection = {}
): Promise<LetterheadRenderOptions> {
  const sender = await resolveLetterheadSender(userId, selection);
  if (!userId) return { ...DEFAULT_OPTIONS, sender };
  try {
    const { getDefaultLetterhead, getLetterhead } =
      await import('../../services/user/letterheadRepository.js');
    const row = selection.letterheadId
      ? await getLetterhead(userId, selection.letterheadId)
      : await getDefaultLetterhead(userId);
    if (!row) return { ...DEFAULT_OPTIONS, sender };

    const { readStationery } = await import('../../services/user/letterheadStationery.js');
    return {
      sender,
      dispatchMode:
        row.dispatch_mode === 'direktfrankierung' ? 'direktfrankierung' : 'fensterkuvert',
      returnLine: row.show_return_line,
      foldMarks: row.show_fold_marks,
      stationery: row.stationery_file ? await readStationery(userId, row.stationery_file) : null,
    };
  } catch (err) {
    // Gleiche Regel wie beim Absender: ein Lesefehler darf kein PDF verhindern.
    log.warn(`Failed to resolve letterhead options for ${userId}:`, err);
    return { ...DEFAULT_OPTIONS, sender };
  }
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
