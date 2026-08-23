import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@gruenerator/ui';
import { useCallback } from 'react';
import { FiChevronDown, FiDownload, FiFileText, FiPrinter } from 'react-icons/fi';

import apiClient from '../../components/utils/apiClient';
import { downloadBlob } from '../../utils/downloadFile';

interface PresentationExportMenuProps {
  documentId: string;
  /** Deck title — used as the exported filename. */
  title?: string | null;
  /**
   * Share-link guests. The PDF path is fully client-side and works for them;
   * the PPTX endpoint sits behind requireAuth and its permission query knows
   * only owners, explicit ACL entries and group shares — a guest can only ever
   * get a 401/404, so the entry is not offered.
   */
  isGuest?: boolean;
}

/**
 * The deck's single download affordance.
 *
 * Lives in EditorTopBar's `rightActions`, not `overflowActions`: below 768px
 * the top bar collapses overflow actions into a sheet that closes on any click
 * inside it, which would tear this menu's own trigger out from under it.
 */
export function PresentationExportMenu({
  documentId,
  title,
  isGuest,
}: PresentationExportMenuProps) {
  const exportPdf = useCallback(() => {
    // No API call: the export tab re-renders the deck and reveal's print view
    // paginates it for the browser's own print dialog.
    const tab = window.open(`/office/${documentId}?present=1&print-pdf`, '_blank', 'noopener');
    void import('sonner').then(({ toast }) =>
      // A blocked popup returns null. Announcing a dialog that never opens
      // leaves the user waiting for it.
      tab
        ? toast.info(
            'Im neuen Tab öffnet sich der Druckdialog. Dort als Ziel „Als PDF speichern" wählen — Hintergrundgrafiken sind bereits aktiviert.',
            { duration: 8000 }
          )
        : toast.error(
            'Der Browser hat das neue Fenster blockiert. Erlaube Pop-ups für diese Seite und versuche es erneut.',
            { duration: 8000 }
          )
    );
  }, [documentId]);

  const exportPptx = useCallback(async () => {
    const { toast } = await import('sonner');
    const pending = toast.loading('PowerPoint-Datei wird erstellt …');
    try {
      // Through the shared apiClient (not a raw fetch) so the download carries
      // auth like every other request and survives a transient 401 during
      // cookie rotation. The body must be {} and not null: apiClient forces
      // application/json, which serializes null to the string "null" — rejected
      // by strict express.json().
      const res = await apiClient.post<Blob>(
        `/presentations/${documentId}/export/pptx`,
        {},
        { responseType: 'blob' }
      );
      await downloadBlob(res.data as Blob, `${title?.trim() || 'Praesentation'}.pptx`);
      toast.success('PowerPoint-Datei erstellt', { id: pending });
    } catch (err) {
      const status = (err as { response?: { status?: number } }).response?.status;
      toast.error(
        status === 404
          ? 'Präsentation nicht gefunden oder kein Zugriff.'
          : status === 401
            ? 'Für den PowerPoint-Export musst du angemeldet sein.'
            : 'PowerPoint-Export fehlgeschlagen.',
        { id: pending }
      );
    }
  }, [documentId, title]);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="glass-btn max-sm:h-11 max-sm:w-11 sm:w-auto sm:gap-[7px] sm:px-3.5"
          aria-label="Herunterladen"
          title="Herunterladen"
        >
          <FiDownload />
          <span className="max-sm:hidden text-sm font-bold">Download</span>
          <FiChevronDown className="max-sm:hidden" size={13} aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuItem onClick={exportPdf} className="gap-sm">
          <FiPrinter className="h-4 w-4 text-grey-500" aria-hidden="true" />
          <span className="flex flex-col items-start">
            Als PDF
            <span className="text-xs text-grey-500">öffnet den Druckdialog</span>
          </span>
        </DropdownMenuItem>
        {!isGuest && (
          <DropdownMenuItem onClick={() => void exportPptx()} className="gap-sm">
            <FiFileText className="h-4 w-4 text-grey-500" aria-hidden="true" />
            <span className="flex flex-col items-start">
              Als PowerPoint
              <span className="text-xs text-grey-500">bearbeitbare .pptx-Datei</span>
            </span>
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
