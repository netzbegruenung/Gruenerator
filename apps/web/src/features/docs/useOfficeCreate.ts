import { templates, useCreateDocument, useDocsAdapter } from '@gruenerator/docs';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

import { useBoardsTyped } from '../../hooks/useBoardsTyped';
import { useAuthStore } from '../../stores/authStore';
import { seedCanvasQuery } from '../image-studio/canvasQuery';

import { createSlideDeck } from './createSlideDeck';

/**
 * Creates an empty Office resource and opens its editor. Shared by the /office
 * hub and the „Neu erstellen" menu on the Arbeiten tab. Needs a `DocsProvider`
 * above it (document navigation goes through the docs adapter).
 */
export function useOfficeCreate() {
  const adapter = useDocsAdapter();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const locale = useAuthStore((s) => s.locale);
  const createDocumentMutation = useCreateDocument();
  const { createBoard } = useBoardsTyped({ enabled: false });

  const createBlankDocument = useCallback(async () => {
    try {
      const title = templates.find((t) => t.id === 'blank')?.defaultTitle || 'Neues Dokument';
      const newDoc = await createDocumentMutation.mutateAsync({ title, documentSubtype: 'blank' });
      adapter.navigateToDocument(newDoc.id);
    } catch (err) {
      console.error('Failed to create document:', err);
    }
  }, [createDocumentMutation, adapter]);

  const createBlankSheet = useCallback(async () => {
    try {
      const newDoc = await createDocumentMutation.mutateAsync({
        title: 'Neue Tabelle',
        documentSubtype: 'sheets',
      });
      adapter.navigateToDocument(newDoc.id);
    } catch (err) {
      console.error('Failed to create sheet:', err);
    }
  }, [createDocumentMutation, adapter]);

  const createBlankPresentation = useCallback(async () => {
    try {
      const deck = await createSlideDeck(locale);
      seedCanvasQuery(queryClient, deck);
      void navigate(`/studio/canvas/${deck.id}`);
    } catch (err) {
      console.error('Failed to create presentation:', err);
    }
  }, [locale, queryClient, navigate]);

  const createBlankBoard = useCallback(() => {
    createBoard.mutate(
      { title: 'Neues Board', boardType: 'kanban' },
      { onSuccess: (board) => navigate(`/boards/${board.id}`) }
    );
  }, [createBoard, navigate]);

  return { createBlankDocument, createBlankSheet, createBlankPresentation, createBlankBoard };
}
