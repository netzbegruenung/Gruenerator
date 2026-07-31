/**
 * The "Als PDF mit Briefkopf" entry of a chat message's document menu.
 *
 * Lives here, not in `packages/chat`: choosing an Absender needs the saved
 * letterheads and `PdfExportDialog`, both of which belong to this app. The chat
 * package only offers the menu entry when a host injects
 * `onExportPdfLetterhead` — mobile injects nothing and the entry disappears.
 *
 * The plumbing is a module-level slot rather than a context, because the
 * consumer is a plain callback inside GlobalChatProvider's `useMemo([])`
 * config, not a component that could read a provider. `requestPdfLetterhead`
 * resolves once the export finishes (or the user cancels), so the menu's
 * spinner stops at the right moment.
 */

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';

import { useAuthStore } from '../../stores/authStore';
import { useExportStore } from '../../stores/core/exportStore';
import { detectRecipient } from '../docs/letterDetection';
import { PdfExportDialog, type PdfExportSubmit } from '../docs/PdfExportDialog';
import { letterheadApi, LETTERHEADS_QUERY_KEY } from '../settings/letterheadApi';

interface PendingExport {
  content: string;
  title: string;
  resolve: () => void;
}

type Opener = (request: PendingExport) => void;

let openDialog: Opener | null = null;

/**
 * Called from the chat config. Resolves when the dialog closes either way — a
 * cancel is a finished action, not a failure.
 */
export function requestPdfLetterheadExport(content: string, title?: string): Promise<void> {
  if (!openDialog) {
    // The host is not mounted (a surface that renders chat outside the global
    // provider). Failing loudly beats a menu entry that silently does nothing.
    return Promise.reject(new Error('PDF-Briefkopf-Dialog ist auf dieser Seite nicht verfügbar.'));
  }
  return new Promise<void>((resolve) => {
    openDialog?.({ content, title: title || 'Chat-Nachricht', resolve });
  });
}

/**
 * Drops the address lines the dialog lifted into the Anschriftfeld, so the
 * letter does not print the recipient twice. `consumedLines` indexes the raw
 * line list, which for a chat message IS the markdown's lines.
 */
function stripDetectedLines(markdown: string): string {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const drop = new Set(detectRecipient(markdown).consumedLines);
  if (drop.size === 0) return markdown;
  return lines
    .filter((_line, index) => !drop.has(index))
    .join('\n')
    .replace(/^\n+/, '');
}

export function ChatPdfLetterheadExportHost() {
  const userId = useAuthStore((s) => s.user?.id);
  const queryClient = useQueryClient();
  const [pending, setPending] = useState<PendingExport | null>(null);

  const { data: letterheads = [] } = useQuery({
    queryKey: LETTERHEADS_QUERY_KEY,
    queryFn: letterheadApi.list,
    enabled: Boolean(userId),
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    openDialog = (request) =>
      setPending((previous) => {
        // A replaced request must still settle. Its caller awaits the promise
        // to clear the menu's busy state, so dropping the resolver leaves that
        // message's document button spinning and disabled for good.
        previous?.resolve();
        return request;
      });
    return () => {
      openDialog = null;
    };
  }, []);

  const finish = useCallback((request: PendingExport) => {
    setPending(null);
    request.resolve();
  }, []);

  const handleSubmit = useCallback(
    (result: PdfExportSubmit) => {
      if (!pending) return;
      const request = pending;
      setPending(null);

      void (async () => {
        const { toast } = await import('sonner');
        const progress = toast.loading('PDF wird erstellt …');
        try {
          // Saving the typed Absender is a convenience and must never block the
          // export the user actually asked for — same rule as the docs editor.
          let letterheadId = result.letterhead.letterheadId;
          if (result.letterhead.saveForLater) {
            try {
              const saved = await letterheadApi.create(result.letterhead.saveForLater);
              letterheadId = saved.id;
              await queryClient.invalidateQueries({ queryKey: LETTERHEADS_QUERY_KEY });
            } catch (error) {
              toast.error(error instanceof Error ? error.message : 'Briefkopf nicht gespeichert');
            }
          }

          const content = result.stripDetected
            ? stripDetectedLines(request.content)
            : request.content;

          await useExportStore.getState().generatePDF(content, request.title, {
            layout: result.layout,
            ...(letterheadId ? { letterheadId } : {}),
            ...(!letterheadId && result.letterhead.inline
              ? { letterhead: result.letterhead.inline }
              : {}),
            ...(result.letter ? { letter: result.letter } : {}),
          });
          toast.success(result.layout === 'letter' ? 'Brief erstellt' : 'PDF erstellt', {
            id: progress,
          });
        } catch (error) {
          console.error('Chat PDF letterhead export failed:', error);
          toast.error(error instanceof Error ? error.message : 'PDF-Export fehlgeschlagen', {
            id: progress,
          });
        } finally {
          request.resolve();
        }
      })();
    },
    [pending, queryClient]
  );

  if (!pending) return null;

  return (
    <PdfExportDialog
      documentTitle={pending.title}
      documentText={pending.content}
      letterheads={letterheads}
      onCancel={() => finish(pending)}
      onSubmit={handleSubmit}
    />
  );
}
