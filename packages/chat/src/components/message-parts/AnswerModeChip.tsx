import {
  type NotebookAnswerModeReason,
  type NotebookResolvedAnswerMode,
} from '@gruenerator/contracts';
import { BookOpenCheck, MessageSquareText } from 'lucide-react';
import { memo } from 'react';

import { answerModeAutoHint, answerModeLabel } from '../../lib/notebookAnswerMode';

interface AnswerModeChipProps {
  mode: NotebookResolvedAnswerMode;
  reason?: NotebookAnswerModeReason | null;
}

/**
 * Which mode a notebook answer ran in — "Präzisionsmodus" or "Chatmodus", plus
 * a quiet "automatisch gewählt" when the auto guard made the call. Same pill
 * as SkillBadge so the two read as one family above an answer.
 */
export const AnswerModeChip = memo(function AnswerModeChip({ mode, reason }: AnswerModeChipProps) {
  const Icon = mode === 'praezision' ? BookOpenCheck : MessageSquareText;
  const hint = answerModeAutoHint(reason);
  return (
    <div className="mb-1.5 inline-flex items-center gap-1.5 rounded-full bg-primary/5 px-2.5 py-1 text-xs text-foreground-muted">
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
      <span className="font-medium">{answerModeLabel(mode)}</span>
      {hint && (
        <>
          <span aria-hidden>·</span>
          <span>{hint}</span>
        </>
      )}
    </div>
  );
});
