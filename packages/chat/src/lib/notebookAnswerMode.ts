import {
  type NotebookAnswerMode,
  type NotebookAnswerModeReason,
  type NotebookResolvedAnswerMode,
} from '@gruenerator/contracts';

export interface NotebookAnswerModeDef {
  mode: NotebookAnswerMode;
  /** User-facing label. Web and mobile never relabel independently. */
  label: string;
  /** Narrow-screen label, where the full one squeezes the composer's input. */
  shortLabel?: string;
  description: string;
  /** Shown as the recommended choice in the picker. */
  recommended?: boolean;
}

/**
 * The mode a notebook surface starts on. The server answers an omitted
 * `answerMode` with `chat` (see `notebookAnswerModeResolver`); preselecting
 * `auto` is a UI decision and lives here, like `DEFAULT_NOTEBOOK_DEPTH`.
 */
export const DEFAULT_NOTEBOOK_ANSWER_MODE: NotebookAnswerMode = 'auto';

/**
 * Notebook answer mode — the presentation half of `notebookAnswerModeSchema`.
 * The ids are the wire enum (F0); only labels and descriptions live here.
 */
export const NOTEBOOK_ANSWER_MODES: NotebookAnswerModeDef[] = [
  {
    mode: 'auto',
    label: 'Magic Search',
    shortLabel: 'Magic',
    description: 'Passt sich deiner Eingabe an',
    recommended: true,
  },
  {
    mode: 'chat',
    label: 'Chat',
    description: 'Schnelle Antwort aus passenden Textstellen',
  },
  {
    mode: 'praezision',
    label: 'Präzision',
    description:
      'Arbeitet direkt mit den Quellen: Listen, Seiten, Zählungen, Zitatprüfung – langsamer',
  },
];

/**
 * The mode's presentation, falling back to the default for an unknown id —
 * the choice is persisted, so an id this build no longer knows can come back
 * from storage.
 */
export function notebookAnswerModeDef(mode?: NotebookAnswerMode | null): NotebookAnswerModeDef {
  return (
    NOTEBOOK_ANSWER_MODES.find((m) => m.mode === mode) ??
    NOTEBOOK_ANSWER_MODES.find((m) => m.mode === DEFAULT_NOTEBOOK_ANSWER_MODE)!
  );
}

/**
 * A notebook start page (web and mobile) offers one more choice than the
 * server knows: `manuell` lists matching sources and never asks the model. It
 * is a client mode, not a wire value — it never reaches `answerMode`. Inside a
 * running conversation only `NOTEBOOK_ANSWER_MODES` are offered.
 */
export type NotebookComposerMode = NotebookAnswerMode | 'manuell';

export interface NotebookComposerModeDef extends Omit<NotebookAnswerModeDef, 'mode'> {
  mode: NotebookComposerMode;
}

export const NOTEBOOK_COMPOSER_MODES: NotebookComposerModeDef[] = [
  ...NOTEBOOK_ANSWER_MODES,
  {
    mode: 'manuell',
    label: 'Manuell',
    description: 'Durchsucht die Quellen, ohne KI',
  },
];

/** Tolerant like `notebookAnswerModeDef`: the choice is persisted. */
export function notebookComposerModeDef(mode?: string | null): NotebookComposerModeDef {
  return NOTEBOOK_COMPOSER_MODES.find((m) => m.mode === mode) ?? notebookAnswerModeDef(null);
}

/** What Magic Search makes of the typed text on the start page: list the
 *  matching sources, or start the chat. */
export type MagicIntent = 'suche' | 'chat';

// Word bounds by hand: `\b` knows no umlauts, so „können“ would never match.
const QUESTION_OPENER =
  /^(?:was|wer|wem|wen|wie|wo|woher|wohin|wann|warum|wieso|weshalb|welche\p{L}*|gibt\s+es|ist|sind|hat|haben|kann|können|soll(?:st|te|test|ten|en|t)?)(?![\p{L}\d])/iu;
// Verb forms only, so nouns typed as keywords („Erklärung“, „Vergleichsmiete“,
// „Liste Kitas“, „Schreiben Ministerium“) stay a search. Anywhere in the text a
// verb counts only lowercase; capitalised it counts only as the opening
// imperative („Erkläre …“), where a noun would not end in -e.
const INSTRUCTION_VERB =
  /(?:^|[^\p{L}\d])(?:erklär(?:e|en|t)?|fasse|vergleich(?:e|en)?|schreib(?:e|en|t)?|liste|nenn(?:e|en|t)?|zeig(?:e|en|t)?|analysier(?:e|en|t)?|bitte)(?![\p{L}\d])/u;
const OPENING_IMPERATIVE =
  /^(?:Erkläre|Fasse|Vergleiche|Schreibe|Nenne|Zeige|Analysiere|Bitte)(?![\p{L}\d])/u;

/** Keywords and filter phrases („Hitzeschutz, Dokumente seit 30 Tagen“) are a
 *  search; a question or an instruction is a chat. Unlike the server's
 *  `searchDepth` openers, „seit“/„bis“/„in“ start a filter here, not a question. */
export function detectMagicIntent(text: string): MagicIntent {
  const trimmed = text.replace(/^[\s\p{P}]+/u, '');
  if (trimmed.includes('?')) return 'chat';
  if (QUESTION_OPENER.test(trimmed)) return 'chat';
  if (OPENING_IMPERATIVE.test(trimmed) || INSTRUCTION_VERB.test(trimmed)) return 'chat';
  return 'suche';
}

/** What a composer mode asks the server for. `manuell` never sends; where it
 *  is not offered (a running conversation) it behaves like the default. Magic
 *  Search that recognised a chat asks for `chat`. */
export function toNotebookAnswerMode(
  mode: NotebookComposerMode,
  intent?: MagicIntent | null
): NotebookAnswerMode {
  if (mode === 'auto' && intent === 'chat') return 'chat';
  return mode === 'manuell' ? DEFAULT_NOTEBOOK_ANSWER_MODE : mode;
}

/** What submitting on a start page does: list the sources (`manuell`, or
 *  Magic Search that recognised keywords), or start the notebook chat. */
export function composerSubmitAction(mode: NotebookComposerMode, text: string): 'search' | 'chat' {
  if (mode === 'manuell') return 'search';
  if (mode === 'auto' && detectMagicIntent(text) === 'suche') return 'search';
  return 'chat';
}

/** Modes that search the sources while the person types. */
export function composerModeRunsLiveSearch(mode: NotebookComposerMode): boolean {
  return mode === 'auto' || mode === 'manuell';
}

const RESOLVED_LABELS: Record<NotebookResolvedAnswerMode, string> = {
  chat: 'Chatmodus',
  praezision: 'Präzisionsmodus',
};

/** Status line while a precision turn works through the sources. */
export const PRAEZISION_PROGRESS_MESSAGE = 'Präzisionsmodus: arbeite direkt mit den Quellen…';

/** The chip on an answer: which mode it actually ran in. */
export function answerModeLabel(resolved: NotebookResolvedAnswerMode): string {
  return RESOLVED_LABELS[resolved];
}

/** Reasons that mean the auto guard picked the mode, not the person. */
const AUTO_CHOSEN_REASONS: ReadonlySet<NotebookAnswerModeReason> = new Set([
  'pregate',
  'guard',
  'guard_fallback',
]);

/** The quiet hint beside the chip when auto decided; `null` otherwise. */
export function answerModeAutoHint(reason: NotebookAnswerModeReason | null): string | null {
  return reason && AUTO_CHOSEN_REASONS.has(reason) ? 'automatisch gewählt' : null;
}
