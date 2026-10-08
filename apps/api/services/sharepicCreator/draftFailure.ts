/**
 * A draft that kept breaking one content limit fails with that limit named:
 * the repair hint the model got is recognised again here, and the person
 * reads what the limit is and what can be done instead.
 */
import {
  SHAREPIC_LIMITS,
  type SharepicCreatorError,
  type SharepicDraftFailureReason,
} from '@gruenerator/contracts';

const HEADLINE_LINE_TOO_LONG = 'Headline-Zeile zu lang';

/** The repair hint for one headline line past the limit. */
export function headlineLineTooLong(where: string, line: string): string {
  return `${where}: ${HEADLINE_LINE_TOO_LONG} – „${line}“ hat ${line.length} Zeichen, erlaubt sind höchstens ${SHAREPIC_LIMITS.headlineLine}. Eine Zeile wird nie länger: verteile den Text auf mehr Zeilen (höchstens ${SHAREPIC_LIMITS.headlineLines}, Umbruch an Sinngrenzen) oder kürze ihn.`;
}

export function draftFailureReason(error: string): SharepicDraftFailureReason | null {
  if (error.includes(HEADLINE_LINE_TOO_LONG)) return 'headline_line_too_long';
  return null;
}

/** What the person reads when the draft failed on the limit. */
export const DRAFT_LIMIT_TEXTS: Record<SharepicDraftFailureReason, string> = {
  headline_line_too_long: `Eine Headline-Zeile darf höchstens ${SHAREPIC_LIMITS.headlineLine} Zeichen haben – ich kann den Text auf mehrere Zeilen verteilen oder kürzen. Sag mir, was dir lieber ist.`,
};

/** `lead` says what failed; then the limit, or `ask` for a clearer request. */
export function draftFailedText(
  lead: string,
  reason: SharepicDraftFailureReason | null,
  ask: string
): string {
  return `${lead} ${reason ? DRAFT_LIMIT_TEXTS[reason] : ask}`;
}

/** The creator's 502: the limit as a code for clients, and named in the text they show. */
export function draftFailedBody(reason: SharepicDraftFailureReason | null): SharepicCreatorError {
  return {
    error: draftFailedText(
      'Der Entwurf ist nicht gelungen.',
      reason,
      'Formuliere den Auftrag etwas genauer und versuch es noch einmal.'
    ),
    ...(reason && { reason }),
  };
}
