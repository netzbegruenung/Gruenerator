'use client';

import { ActionBarPrimitive, useAuiState } from '@assistant-ui/react';
import { replaceVisualBlocksWithText } from '@gruenerator/contracts';
import { getContractsClient } from '@gruenerator/shared/api';
import {
  slugifyName,
  sourceLinksToCitations,
  withSourcesMarkdown,
} from '@gruenerator/shared/utils';
import {
  DropdownMenuItem,
  ResponsiveMenu,
  ResponsiveMenuItem,
  ResponsiveMenuSection,
} from '@gruenerator/ui';
import {
  Copy,
  Check,
  FileDown,
  FileText,
  Headphones,
  Lightbulb,
  Loader2,
  Mail,
  RefreshCw,
  SquarePen,
  ThumbsUp,
  ThumbsDown,
} from 'lucide-react';
import { memo, useState } from 'react';
import { HiOutlineDocumentText } from 'react-icons/hi';

import { useChatNavigation } from '../../context/ChatNavigationContext';
import { useExplainableActionEnabled } from '../../context/ExplainableActionContext';
import { useReadonlyMode } from '../../context/ReadonlyModeContext';
import { useRegenerateMessage } from '../../hooks/useRegenerateMessage';
import { downloadBlob } from '../../lib/downloadBlob';
import {
  buildDocumentActions,
  canCreateExplainable,
  filenameFromDisposition,
  messageTitle,
  type DocumentActionId,
} from '../../lib/messageDocumentActions';
import { notifyError } from '../../lib/notify';
import { useChatConfigStore } from '../../stores/chatConfigStore';
import { useChatDensity } from '../thread/chatDensityContext';

import { MessageBranchPicker } from './MessageBranchPicker';
import { MessageSourcesButton } from './MessageSourcesButton';
import { MessageTime } from './MessageTimestamp';
import { MessageTTSButton } from './MessageTTSButton';

import type { Citation, ChatMessage } from '../../hooks/useChatGraphStream';
import type { ExportToDocsBody, ExportToDocsResponse } from '@gruenerator/contracts';
import type { ReactNode } from 'react';

/** Icon and handler per menu entry; the entries themselves come from the model. */
interface DocumentActionUi {
  icon: ReactNode;
  run: () => Promise<void>;
}

interface MessageActionsProps {
  content: string;
  metadata?: ChatMessage['metadata'];
  /** Show thumbs up/down — only when this turn produced a Langfuse trace. */
  showFeedback?: boolean;
  /** Sources of this turn. Rendered as a glyph stack at the end of the row;
   *  the list itself stays in `SearchResultsSection` below. */
  sources?: Citation[];
  sourcesOpen?: boolean;
  onToggleSources?: () => void;
}

export const MessageActions = memo(function MessageActions({
  content: rawContent,
  metadata,
  showFeedback = false,
  sources,
  sourcesOpen = false,
  onToggleSources,
}: MessageActionsProps) {
  // Every outlet below (copy, export, TTS) is plain text: a source link
  // `[Titel](quelle:N)` leaves the chat as `Titel [N]`, the form they know.
  // Word, PDF and the editor get the visual blocks (```bars {…}) as they are:
  // the server draws charts and bars as figures and turns the rest into tables
  // and lists. Copy, read-aloud and podcast get the readable text form.
  const exportContent = sourceLinksToCitations(rawContent);
  const content = replaceVisualBlocksWithText(exportContent);
  // Editor and PDF leave as a document of their own; Word gets its source list
  // from the server (`chatMessageExport`), copy and TTS get none.
  const documentContent = withSourcesMarkdown(exportContent, metadata?.citations);
  const isCompact = useChatDensity() === 'compact';
  const readOnly = useReadonlyMode();
  const canReload = useAuiState((s) => s.thread.capabilities.reload);
  const handleRegenerate = useRegenerateMessage();
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState<DocumentActionId | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [linkedDocId, setLinkedDocId] = useState<string | null>(null);
  const onExportPdfLetterhead = useChatConfigStore((s) => s.onExportPdfLetterhead);
  const getPodcastUrl = useChatConfigStore((s) => s.getPodcastUrl);
  const nav = useChatNavigation();
  const offerExplainable = useExplainableActionEnabled();
  const persistedMessageId = useAuiState((s) => {
    const id = (s.message.metadata?.custom as { persistedMessageId?: unknown } | undefined)
      ?.persistedMessageId;
    return typeof id === 'string' ? id : null;
  });

  const handleCopy = async () => {
    await navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleExportDocx = async () => {
    try {
      const { fetch: configFetch, endpoints } = useChatConfigStore.getState();
      const response = await configFetch(endpoints.exportMessage, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: exportContent,
          role: 'assistant',
          timestamp: Date.now(),
          metadata,
        }),
      });

      if (!response.ok) throw new Error(`Export failed (HTTP ${response.status})`);
      await downloadBlob(
        await response.blob(),
        filenameFromDisposition(response.headers.get('Content-Disposition'), 'docx')
      );
    } catch (error) {
      console.error('Export error:', error);
      notifyError('Export fehlgeschlagen', 'Die Nachricht konnte nicht heruntergeladen werden.');
    }
  };

  /**
   * Plain PDF, no Absender. Goes straight to the shared export endpoint rather
   * than through an injected handler — nothing about it is host-specific, so
   * every surface including mobile gets it without wiring.
   */
  const handleExportPdf = async () => {
    try {
      const { fetch: configFetch, endpoints } = useChatConfigStore.getState();
      const response = await configFetch(endpoints.exportPdf, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: documentContent, title: messageTitle(content) }),
      });

      if (!response.ok) throw new Error(`Export failed (HTTP ${response.status})`);
      await downloadBlob(
        await response.blob(),
        filenameFromDisposition(response.headers.get('Content-Disposition'), 'pdf')
      );
    } catch (error) {
      console.error('PDF export error:', error);
      notifyError('Export fehlgeschlagen', 'Das PDF konnte nicht erstellt werden.');
    }
  };

  const handleExportPdfLetterhead = async () => {
    if (!onExportPdfLetterhead) return;
    try {
      await onExportPdfLetterhead(documentContent, messageTitle(content));
    } catch (error) {
      console.error('PDF letterhead export error:', error);
      notifyError('Export fehlgeschlagen', 'Das PDF konnte nicht erstellt werden.');
    }
  };

  const handleEditInDocs = async () => {
    try {
      const {
        onEditInDocs,
        fetch: configFetch,
        endpoints,
        getDocsUrl,
      } = useChatConfigStore.getState();

      if (onEditInDocs) {
        const docId = await onEditInDocs(documentContent, undefined, linkedDocId ?? undefined);
        if (docId && !linkedDocId) setLinkedDocId(docId);
        return;
      }

      if (linkedDocId) {
        window.open(`${getDocsUrl()}/document/${linkedDocId}`, '_blank');
        return;
      }

      const response = await configFetch(endpoints.exportToDocs, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: documentContent,
          documentType: 'chat-response',
        } satisfies ExportToDocsBody),
      });

      if (!response.ok) throw new Error('Document creation failed');

      const data = (await response.json()) as ExportToDocsResponse;
      if (data.documentId) {
        setLinkedDocId(data.documentId);
        window.open(`${getDocsUrl()}/document/${data.documentId}`, '_blank');
      }
    } catch (error) {
      console.error('Edit in Docs error:', error);
      notifyError('Dokument konnte nicht erstellt werden', 'Bitte versuche es erneut.');
    }
  };

  /** Takes ~15 s server-side (LLM rewrite); images follow in the background. */
  const handleCreateExplainable = async () => {
    if (!persistedMessageId) return;
    try {
      const res = await getContractsClient().explainables.createFromMessage({
        body: { messageId: persistedMessageId },
      });
      if (res.status === 201) {
        const path = `/erklaert/${slugifyName(res.body.title, 'explainable')}-${res.body.slugSuffix}`;
        if (nav) nav.navigate(path);
        else window.location.assign(path);
        return;
      }
      if (res.status === 429) {
        notifyError(res.body.error);
        return;
      }
      throw new Error(`HTTP ${res.status}`);
    } catch (error) {
      console.error('Explainable error:', error);
      notifyError('Explainable konnte nicht erstellt werden', 'Bitte versuche es erneut.');
    }
  };

  /**
   * The podcast takes minutes, so the server only queues it and the player
   * page shows the progress. The tab opens before the request, inside the
   * click — opened after an await, a popup blocker would swallow it.
   */
  const handleCreatePodcast = async () => {
    if (!getPodcastUrl) return;
    const tab = window.open('', '_blank');
    try {
      const title = messageTitle(content);
      const res = await getContractsClient().podcasts.create({ body: { text: content, title } });
      if (res.status === 202) {
        // The name part is cosmetic; the page swaps in the script's title once it exists.
        const url = getPodcastUrl(`${slugifyName(title, 'podcast')}-${res.body.slugSuffix}`);
        if (tab) tab.location.href = url;
        else window.location.assign(url);
        return;
      }
      tab?.close();
      if (res.status === 429 || res.status === 503) {
        notifyError(res.body.error);
        return;
      }
      throw new Error(`HTTP ${res.status}`);
    } catch (error) {
      tab?.close();
      console.error('Podcast error:', error);
      notifyError('Podcast konnte nicht erstellt werden', 'Bitte versuche es erneut.');
    }
  };

  const documentActions = buildDocumentActions({
    hasLinkedDoc: Boolean(linkedDocId),
    canExportPdfLetterhead: Boolean(onExportPdfLetterhead),
    canCreateExplainable: canCreateExplainable({
      offered: offerExplainable,
      persistedMessageId,
      readOnly,
    }),
    canCreatePodcast: Boolean(getPodcastUrl) && !readOnly,
  });

  const documentActionUi: Record<DocumentActionId, DocumentActionUi> = {
    docs: { icon: <SquarePen className="h-3.5 w-3.5" />, run: handleEditInDocs },
    docx: { icon: <FileText className="h-3.5 w-3.5" />, run: handleExportDocx },
    pdf: { icon: <FileDown className="h-3.5 w-3.5" />, run: handleExportPdf },
    'pdf-letterhead': { icon: <Mail className="h-3.5 w-3.5" />, run: handleExportPdfLetterhead },
    explainable: { icon: <Lightbulb className="h-3.5 w-3.5" />, run: handleCreateExplainable },
    podcast: { icon: <Headphones className="h-3.5 w-3.5" />, run: handleCreatePodcast },
  };

  /**
   * One action at a time. Each leaves the chat (download, new tab, dialog),
   * so a second one started underneath the first would land on top of it with
   * no way for the user to tell which won.
   */
  const runDocumentAction = (id: DocumentActionId) => {
    if (busy) return;
    setMenuOpen(false);
    setBusy(id);
    void documentActionUi[id].run().finally(() => setBusy(null));
  };

  return (
    <div className={`${isCompact ? 'mt-2' : 'mt-4'} flex flex-wrap items-center gap-1`}>
      <button
        onClick={handleCopy}
        className="rounded-lg p-1.5 text-foreground-muted hover:bg-primary/10 hover:text-foreground"
        aria-label="Kopieren"
      >
        {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
      </button>
      <MessageTTSButton content={content} />
      {/*
        One document button, four destinations. Download and "im Editor
        bearbeiten" used to be two glyphs side by side, which left no room for
        the PDF variants and made the row's two most similar icons the two the
        user had to tell apart.
      */}
      <ResponsiveMenu
        open={menuOpen}
        onOpenChange={setMenuOpen}
        dropdownSide="bottom"
        dropdownAlign="start"
        sheetTitle="Dokument"
        trigger={
          <button
            disabled={Boolean(busy)}
            className="rounded-lg p-1.5 text-foreground-muted hover:bg-primary/10 hover:text-foreground disabled:opacity-50"
            aria-label="Als Dokument"
            title="Als Dokument"
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <HiOutlineDocumentText className="h-4 w-4" />
            )}
          </button>
        }
        desktopContent={documentActions.map((action) => (
          <DropdownMenuItem
            key={action.id}
            disabled={Boolean(busy)}
            onSelect={() => runDocumentAction(action.id)}
          >
            {documentActionUi[action.id].icon}
            {action.label}
          </DropdownMenuItem>
        ))}
        mobileContent={
          <ResponsiveMenuSection title="Dokument">
            {documentActions.map((action) => (
              <ResponsiveMenuItem
                key={action.id}
                icon={documentActionUi[action.id].icon}
                disabled={Boolean(busy)}
                onClick={() => runDocumentAction(action.id)}
              >
                {action.label}
              </ResponsiveMenuItem>
            ))}
          </ResponsiveMenuSection>
        }
      />
      {!readOnly && canReload && (
        <button
          onClick={handleRegenerate}
          className="rounded-lg p-1.5 text-foreground-muted hover:bg-primary/10 hover:text-foreground"
          aria-label="Neu generieren"
          title="Neu generieren"
        >
          <RefreshCw className="h-4 w-4" />
        </button>
      )}
      <MessageBranchPicker />
      {showFeedback && !readOnly && (
        <>
          <ActionBarPrimitive.FeedbackPositive
            className="rounded-lg p-1.5 text-foreground-muted hover:bg-primary/10 hover:text-foreground data-[submitted]:text-primary"
            aria-label="Hilfreich"
            title="Hilfreich"
          >
            <ThumbsUp className="h-4 w-4" />
          </ActionBarPrimitive.FeedbackPositive>
          <ActionBarPrimitive.FeedbackNegative
            className="rounded-lg p-1.5 text-foreground-muted hover:bg-primary/10 hover:text-foreground data-[submitted]:text-primary"
            aria-label="Nicht hilfreich"
            title="Nicht hilfreich"
          >
            <ThumbsDown className="h-4 w-4" />
          </ActionBarPrimitive.FeedbackNegative>
        </>
      )}
      {sources && sources.length > 0 && onToggleSources && (
        <MessageSourcesButton citations={sources} open={sourcesOpen} onToggle={onToggleSources} />
      )}
      <MessageTime className="ml-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 pointer-coarse:opacity-100" />
    </div>
  );
});
