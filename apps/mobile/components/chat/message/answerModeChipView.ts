import { answerModeAutoHint, answerModeLabel } from '@gruenerator/chat';
import {
  type NotebookAnswerModeReason,
  type NotebookResolvedAnswerMode,
} from '@gruenerator/contracts';

export interface AnswerModeChipView {
  label: string;
  /** "automatisch gewählt" when the auto guard picked the mode, else null. */
  hint: string | null;
  accessibilityLabel: string;
}

/**
 * What the mode chip on a notebook answer says — null for every message that
 * carries no mode (chat answers, notebook answers from before answer modes).
 */
export function buildAnswerModeChipView(metadata: {
  answerMode?: NotebookResolvedAnswerMode;
  answerModeReason?: NotebookAnswerModeReason;
}): AnswerModeChipView | null {
  if (!metadata.answerMode) return null;
  const label = answerModeLabel(metadata.answerMode);
  const hint = answerModeAutoHint(metadata.answerModeReason ?? null);
  return {
    label,
    hint,
    accessibilityLabel: hint ? `Beantwortet im ${label}, ${hint}` : `Beantwortet im ${label}`,
  };
}
