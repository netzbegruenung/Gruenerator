import {
  type NotebookAnswerMode,
  type NotebookAnswerModeReason,
  type NotebookResolvedAnswerMode,
} from '@gruenerator/contracts';

export interface NotebookAnswerModeDef {
  mode: NotebookAnswerMode;
  /** User-facing label. Web and mobile never relabel independently. */
  label: string;
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
    label: 'Automatisch',
    description: 'Wählt je Frage',
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
 * The web notebook start page offers one more choice than the server knows:
 * `manuell` lists matching sources and never asks the model. It is a client
 * mode, not a wire value — it never reaches `answerMode`, and mobile keeps
 * `NOTEBOOK_ANSWER_MODES`.
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

/** What a composer mode asks the server for. `manuell` never sends; where it
 *  is not offered (a running conversation) it behaves like the default. */
export function toNotebookAnswerMode(mode: NotebookComposerMode): NotebookAnswerMode {
  return mode === 'manuell' ? DEFAULT_NOTEBOOK_ANSWER_MODE : mode;
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
