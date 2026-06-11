import { useDocAIReviewState, acceptDocumentAI, rejectDocumentAI } from '@gruenerator/docs';
import { useState } from 'react';
import { PiSparkle, PiSpinner } from 'react-icons/pi';

import type { BlockNoteEditor } from '@blocknote/core';

/**
 * Floating review bar for chat-triggered AI suggestions — the web counterpart
 * to mobile's native DocAiReviewBar. Chat edits apply diff marks without ever
 * opening BlockNote's AI popover (the popover would lock the editor and anchor
 * to a block the edit may delete), so this bar hosts Accept/Reject instead.
 * Hidden while the popover is open (toolbar/slash-menu AI reviews itself).
 */
export function DocAiReviewBar({
  documentId,
  editor,
}: {
  documentId: string;
  editor: BlockNoteEditor | null;
}) {
  const { isPendingReview, isStreaming } = useDocAIReviewState(editor, documentId);
  const [busy, setBusy] = useState(false);

  if (!isPendingReview) return null;

  const handleAccept = () => {
    setBusy(true);
    try {
      const result = acceptDocumentAI(documentId);
      if (result === 'not-broadcast') {
        void import('sonner').then(({ toast }) =>
          toast.error(
            'Änderung übernommen, aber nicht an Mitarbeitende übertragen. Bitte Verbindung prüfen und das Dokument neu laden.'
          )
        );
      } else if (result === 'no-extension') {
        void import('sonner').then(({ toast }) =>
          toast.error('Übernehmen fehlgeschlagen — der Editor ist nicht bereit.')
        );
      }
    } finally {
      setBusy(false);
    }
  };

  const handleReject = () => {
    rejectDocumentAI(documentId);
  };

  const disabled = isStreaming || busy;

  return (
    <div className="flex items-center gap-3 rounded-full bg-white/85 dark:bg-grey-900/85 backdrop-blur-xl border border-black/8 dark:border-white/10 shadow-lg px-4 py-2">
      <span className="flex items-center gap-1.5 text-sm font-semibold text-grey-800 dark:text-grey-200">
        {isStreaming ? (
          <>
            <PiSpinner size={16} className="animate-spin text-secondary-600" />
            KI schreibt …
          </>
        ) : (
          <>
            <PiSparkle size={16} className="text-secondary-600" />
            KI-Vorschlag
          </>
        )}
      </span>
      <div className="flex items-center gap-2">
        <button
          onClick={handleReject}
          disabled={disabled}
          className="px-3 py-1.5 text-sm font-medium rounded-lg border border-grey-300 dark:border-grey-600 text-grey-700 dark:text-grey-300 transition-colors hover:bg-grey-100 dark:hover:bg-grey-800 disabled:opacity-50 disabled:cursor-not-allowed"
          aria-label="KI-Vorschlag verwerfen"
        >
          Verwerfen
        </button>
        <button
          onClick={handleAccept}
          disabled={disabled}
          className="px-3 py-1.5 text-sm font-semibold rounded-lg bg-primary-600 text-white transition-colors hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
          aria-label="KI-Vorschlag übernehmen"
        >
          Übernehmen
        </button>
      </div>
    </div>
  );
}
