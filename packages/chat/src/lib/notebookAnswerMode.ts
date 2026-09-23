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
export function notebookAnswerModeDef(mode: NotebookAnswerMode | undefined): NotebookAnswerModeDef {
  return (
    NOTEBOOK_ANSWER_MODES.find((m) => m.mode === mode) ??
    NOTEBOOK_ANSWER_MODES.find((m) => m.mode === DEFAULT_NOTEBOOK_ANSWER_MODE)!
  );
}

const RESOLVED_LABELS: Record<NotebookResolvedAnswerMode, string> = {
  chat: 'Chatmodus',
  praezision: 'Präzisionsmodus',
};

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
