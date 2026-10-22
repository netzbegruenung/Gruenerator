/**
 * A draft that kept breaking one content limit fails with that limit named:
 * the repair hint the model got is recognised again here, and the person
 * reads what the limit is and what can be done instead.
 */
import {
  SHAREPIC_LIMITS,
  sharepicFormLabel,
  stripInlineMarks,
  type SharepicCreatorError,
  type SharepicDraftFailureReason,
  type SharepicFormId,
} from '@gruenerator/contracts';

const HEADLINE_LINE_TOO_LONG = 'Headline-Zeile zu lang';

/** The repair hint for one headline line past the limit. */
export function headlineLineTooLong(where: string, line: string): string {
  return `${where}: ${HEADLINE_LINE_TOO_LONG} – „${line}“ hat ${stripInlineMarks(line).length} sichtbare Zeichen, erlaubt sind höchstens ${SHAREPIC_LIMITS.headlineLine} (Hervorhebungen wie ==…== zählen nicht). Eine Zeile wird nie länger: verteile den Text auf mehr Zeilen (höchstens ${SHAREPIC_LIMITS.headlineLines}, Umbruch an Sinngrenzen) oder kürze ihn.`;
}

/** The fewest slides a carousel has: two carry a question and its answer. */
export const CAROUSEL_MIN_SLIDES = 2;

const CAROUSEL_SLIDES = `${sharepicFormLabel('karussell')}: ${CAROUSEL_MIN_SLIDES}–${SHAREPIC_LIMITS.slides} Slides`;

export function carouselSlideCount(slides: number): string {
  return `${CAROUSEL_SLIDES}, du hast ${slides}. Verteile den Inhalt auf mehr Slides oder schließ mit einer Aufruf-Slide (Kapitel karussell).`;
}

export function draftFailureReason(error: string): SharepicDraftFailureReason | null {
  if (error.includes(HEADLINE_LINE_TOO_LONG)) return 'headline_line_too_long';
  if (error.includes(CAROUSEL_SLIDES)) return 'carousel_slide_count';
  return null;
}

/**
 * Why the last attempt failed. Only `content` is the request's doing; the
 * others must not send the person off to rephrase a request that was fine.
 */
export type DraftFailure =
  | { kind: 'content' }
  /** The model answered without a usable spec (`"background":{}`, 21.10.2026). */
  | { kind: 'structure' }
  /** Every provider of the chain failed. */
  | { kind: 'provider' }
  /** The request's form could not be built from it. */
  | { kind: 'form'; form: SharepicFormId };

export class DraftFailedError extends Error {
  /** The content limit the last attempt broke, when it was one the person can be told. */
  readonly reason: SharepicDraftFailureReason | null;
  readonly failure: DraftFailure;
  constructor(message: string, failure: DraftFailure = { kind: 'content' }) {
    super(message);
    this.reason = draftFailureReason(message);
    this.failure = failure;
  }
}

/** What the person reads when the draft failed on the limit. */
export const DRAFT_LIMIT_TEXTS: Record<SharepicDraftFailureReason, string> = {
  headline_line_too_long: `Eine Headline-Zeile darf höchstens ${SHAREPIC_LIMITS.headlineLine} Zeichen haben – ich kann den Text auf mehrere Zeilen verteilen oder kürzen. Sag mir, was dir lieber ist.`,
  carousel_slide_count: `Ein Karussell hat ${CAROUSEL_MIN_SLIDES} bis ${SHAREPIC_LIMITS.slides} Folien – ich kann den Inhalt auf ${CAROUSEL_MIN_SLIDES} Folien verteilen oder ein einzelnes Sharepic daraus machen. Sag mir, was dir lieber ist.`,
};

const TRY_AGAIN = 'Versuch es in einem Moment noch einmal.';

/** What went wrong, in the person's terms — `null` when the request is the lever. */
function failureText(failure: DraftFailure): string | null {
  switch (failure.kind) {
    case 'structure':
      return `Das KI-Modell hat auch nach mehreren Versuchen keinen vollständigen Entwurf geliefert – an deinem Auftrag lag das nicht. ${TRY_AGAIN}`;
    case 'provider':
      return `Der KI-Dienst war gerade nicht erreichbar. ${TRY_AGAIN}`;
    case 'form':
      return `Als ${sharepicFormLabel(failure.form)} ließ sich der Auftrag nicht umsetzen. Wähl eine andere Form oder ergänze, was dafür fehlt.`;
    case 'content':
      return null;
  }
}

/** `lead` says what failed; then the limit, the cause, or `ask` for a clearer request. */
export function draftFailedText(lead: string, error: DraftFailedError, ask: string): string {
  return `${lead} ${error.reason ? DRAFT_LIMIT_TEXTS[error.reason] : (failureText(error.failure) ?? ask)}`;
}

/** The creator's 502: the limit as a code for clients, and named in the text they show. */
export function draftFailedBody(error: DraftFailedError): SharepicCreatorError {
  return {
    error: draftFailedText(
      'Der Entwurf ist nicht gelungen.',
      error,
      'Formuliere den Auftrag etwas genauer und versuch es noch einmal.'
    ),
    ...(error.reason && { reason: error.reason }),
  };
}
