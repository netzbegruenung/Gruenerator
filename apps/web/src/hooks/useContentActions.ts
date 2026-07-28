import {
  type CollabSubtype,
  type ExportToDocsResponse,
  type TodoListResponse,
} from '@gruenerator/contracts';
import { getContractsClient } from '@gruenerator/shared/api';
import { toast } from '@gruenerator/ui';
import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import apiClient from '../components/utils/apiClient';
import { extractHTMLContent } from '../components/utils/contentExtractor';

interface UseContentActionsOptions {
  getContent: () => string;
  getTitle: () => string;
  /**
   * Subtype for the created collaborative document. Typed as `CollabSubtype`
   * rather than `string` on purpose: the server silently downgrades an unknown
   * value to 'blank' (exportToDocsController), so a wrong value would only ever
   * surface as a mislabelled document — compile time is where to catch it.
   */
  getDocumentType?: () => CollabSubtype;
}

/**
 * Open a tab synchronously inside the click gesture and navigate it once the
 * document exists. Calling `window.open` after the `await` puts it outside the
 * user-gesture window, where Safari and strict Firefox block it silently — the
 * user clicks and nothing happens at all.
 *
 * `noopener` is deliberately absent from the feature string: with it,
 * `window.open` returns null and no handle is left to navigate. The target is
 * same-origin, so clearing `opener` afterwards is equivalent.
 */
function openPendingTab(): Window | null {
  return window.open('', '_blank');
}

function navigatePendingTab(tab: Window | null, url: string): void {
  if (tab) {
    tab.opener = null;
    tab.location.replace(url);
  } else {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

export function useContentActions({
  getContent,
  getTitle,
  getDocumentType,
}: UseContentActionsOptions) {
  const navigate = useNavigate();
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const handleOpenInDocs = useCallback(async () => {
    setActionLoading('docs');
    const tab = openPendingTab();
    try {
      const content = getContent();
      const title = getTitle();
      const html = await extractHTMLContent(content);
      const res = await apiClient.post<ExportToDocsResponse>('/docs/from-export', {
        content: html,
        title,
        documentType: getDocumentType?.() ?? 'blank',
      });
      navigatePendingTab(tab, `/office/${res.data.documentId}`);
    } catch (error) {
      tab?.close();
      toast.error(errorMessage(error, 'Dokument konnte nicht erstellt werden'));
    } finally {
      setActionLoading(null);
    }
  }, [getContent, getTitle, getDocumentType]);

  const handleCreateTodoList = useCallback(async () => {
    setActionLoading('todo');
    const tab = openPendingTab();
    try {
      const content = getContent();
      const title = getTitle();
      const res = await apiClient.post<TodoListResponse>('/voice/todo-list', {
        text: content,
        title,
      });
      const html = res.data?.content ?? '';
      const docRes = await apiClient.post<ExportToDocsResponse>('/docs/from-export', {
        content: html,
        title: `Aufgaben — ${title}`,
        documentType: 'checkliste',
      });
      // The extraction prompt only sees the first N characters. Saying so beats
      // handing over a list of the first fifteen minutes that looks complete.
      if (res.data?.truncated) {
        const percent = res.data.totalChars
          ? Math.round(((res.data.coveredChars ?? 0) / res.data.totalChars) * 100)
          : null;
        toast.warning(
          percent != null
            ? `Nur die ersten ${percent} % des Textes wurden ausgewertet — die Liste kann unvollständig sein.`
            : 'Der Text wurde für die Auswertung gekürzt — die Liste kann unvollständig sein.'
        );
      }
      navigatePendingTab(tab, `/office/${docRes.data.documentId}`);
    } catch (error) {
      tab?.close();
      toast.error(errorMessage(error, 'Aufgabenliste konnte nicht erstellt werden'));
    } finally {
      setActionLoading(null);
    }
  }, [getContent, getTitle]);

  const handleCreateBoard = useCallback(async () => {
    setActionLoading('board');
    try {
      const content = getContent();
      const client = getContractsClient();
      const result = await client.boards.generateBoard({
        body: {
          description: `Erstelle ein Aufgaben-Board aus folgendem Text. Extrahiere alle Aufgaben, Beschlüsse und Action Items:\n\n${content.slice(0, 6000)}`,
        },
      });
      // A non-201 used to fall through as a no-op, which reads as a dead button.
      if (result.status !== 201) throw new Error('Board konnte nicht erstellt werden');
      void navigate(`/boards/${result.body.board.id}`, {
        state: { generatedStructure: result.body.generatedStructure },
      });
    } catch (error) {
      toast.error(errorMessage(error, 'Board konnte nicht erstellt werden'));
    } finally {
      setActionLoading(null);
    }
  }, [getContent, navigate]);

  return {
    handleOpenInDocs,
    handleCreateTodoList,
    handleCreateBoard,
    actionLoading,
  };
}
