import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import apiClient from '../components/utils/apiClient';
import { extractHTMLContent } from '../components/utils/contentExtractor';
import { downloadFile } from '../utils/downloadFile';

interface EditorModalState {
  documentId: string;
  initialContent: string;
  title: string;
}

interface UseContentActionsOptions {
  getContent: () => string;
  getTitle: () => string;
}

export function useContentActions({ getContent, getTitle }: UseContentActionsOptions) {
  const navigate = useNavigate();
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [editorModal, setEditorModal] = useState<EditorModalState | null>(null);

  const handleOpenInDocs = useCallback(async () => {
    setActionLoading('docs');
    try {
      const content = getContent();
      const title = getTitle();
      const html = await extractHTMLContent(content);
      const res = await apiClient.post('/docs/from-export', {
        content: html,
        title,
        documentType: 'transkription',
      });
      setEditorModal({ documentId: res.data.documentId, initialContent: content, title });
    } finally {
      setActionLoading(null);
    }
  }, [getContent, getTitle]);

  const handleCreateTodoList = useCallback(async () => {
    setActionLoading('todo');
    try {
      const content = getContent();
      const title = getTitle();
      const res = await apiClient.post('/voice/todo-list', { text: content, title });
      const html = res.data?.content ?? '';
      const docRes = await apiClient.post('/docs/from-export', {
        content: html,
        title: `Aufgaben — ${title}`,
        documentType: 'checkliste',
      });
      setEditorModal({
        documentId: docRes.data.documentId,
        initialContent: html,
        title: `Aufgaben — ${title}`,
      });
    } finally {
      setActionLoading(null);
    }
  }, [getContent, getTitle]);

  const handleCreateBoard = useCallback(async () => {
    setActionLoading('board');
    try {
      const content = getContent();
      const title = getTitle();
      const res = await apiClient.post('/boards/generate', {
        description: `Erstelle ein Aufgaben-Board aus folgendem Text. Extrahiere alle Aufgaben, Beschlüsse und Action Items:\n\n${content.slice(0, 6000)}`,
        title,
      });
      if (res.data?.board?.id) {
        navigate(`/boards/${res.data.board.id}`, {
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

  const closeEditorModal = useCallback(() => setEditorModal(null), []);

  return {
    handleOpenInDocs,
    handleCreateTodoList,
    handleCreateBoard,
    handleDownloadTxt,
    actionLoading,
    editorModal,
    closeEditorModal,
  };
}
