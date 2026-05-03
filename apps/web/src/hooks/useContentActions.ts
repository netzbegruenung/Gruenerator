import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import apiClient from '../components/utils/apiClient';
import { extractHTMLContent } from '../components/utils/contentExtractor';
import { downloadFile } from '../utils/downloadFile';

interface DocsFromExportResponse {
  documentId: string;
}

interface TodoListResponse {
  content?: string;
}

interface BoardGenerateResponse {
  board?: { id: string };
  generatedStructure?: unknown;
}

interface UseContentActionsOptions {
  getContent: () => string;
  getTitle: () => string;
}

export function useContentActions({ getContent, getTitle }: UseContentActionsOptions) {
  const navigate = useNavigate();
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const handleOpenInDocs = useCallback(async () => {
    setActionLoading('docs');
    try {
      const content = getContent();
      const title = getTitle();
      const html = await extractHTMLContent(content);
      const res = await apiClient.post<DocsFromExportResponse>('/docs/from-export', {
        content: html,
        title,
        documentType: 'transkription',
      });
      window.open(`/docs/${res.data.documentId}`, '_blank', 'noopener,noreferrer');
    } finally {
      setActionLoading(null);
    }
  }, [getContent, getTitle]);

  const handleCreateTodoList = useCallback(async () => {
    setActionLoading('todo');
    try {
      const content = getContent();
      const title = getTitle();
      const res = await apiClient.post<TodoListResponse>('/voice/todo-list', {
        text: content,
        title,
      });
      const html = res.data?.content ?? '';
      const docRes = await apiClient.post<DocsFromExportResponse>('/docs/from-export', {
        content: html,
        title: `Aufgaben — ${title}`,
        documentType: 'checkliste',
      });
      window.open(`/docs/${docRes.data.documentId}`, '_blank', 'noopener,noreferrer');
    } finally {
      setActionLoading(null);
    }
  }, [getContent, getTitle]);

  const handleCreateBoard = useCallback(async () => {
    setActionLoading('board');
    try {
      const content = getContent();
      const title = getTitle();
      const res = await apiClient.post<BoardGenerateResponse>('/boards/generate', {
        description: `Erstelle ein Aufgaben-Board aus folgendem Text. Extrahiere alle Aufgaben, Beschlüsse und Action Items:\n\n${content.slice(0, 6000)}`,
        title,
      });
      if (res.data?.board?.id) {
        void navigate(`/boards/${res.data.board.id}`, {
          state: { generatedStructure: res.data.generatedStructure },
        });
      }
    } finally {
      setActionLoading(null);
    }
  }, [getContent, getTitle, navigate]);

  const handleDownloadTxt = useCallback(() => {
    const content = getContent();
    const title = getTitle();
    downloadFile(content, `${title}.txt`, 'text/plain');
  }, [getContent, getTitle]);

  return {
    handleOpenInDocs,
    handleCreateTodoList,
    handleCreateBoard,
    handleDownloadTxt,
    actionLoading,
  };
}
