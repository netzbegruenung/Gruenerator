import { DocsProvider } from '@gruenerator/docs';
import { useQuery } from '@tanstack/react-query';
import { lazy, Suspense, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { DottedBackground } from '../../components/common/DottedBackground';
import ErrorBoundary from '../../components/ErrorBoundary';
import apiClient from '../../components/utils/apiClient';
import { webAppDocsAdapter } from '../docs/docsAdapter';

import { PlannerKanban } from './components/PlannerKanban';
import { useBoardCollaboration } from './hooks/useBoardCollaboration';
import { useBoardState } from './hooks/useBoardState';
import { useViewData } from './hooks/useViewData';
import { getBoardType } from './types';

import type { Board } from './types';
import type { HocuspocusProvider } from '@hocuspocus/provider';
import type { Doc } from 'yjs';

const LazyExcalidrawBoard = lazy(() =>
  import('./components/ExcalidrawBoard').then((m) => ({ default: m.ExcalidrawBoard }))
);

function PublicBoardContent() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const {
    data: board,
    isLoading,
    error,
  } = useQuery<Board & { share_mode?: string; share_permission?: string }>({
    queryKey: ['boards-public', id],
    queryFn: async () => {
      const res = await apiClient.get(`/boards/public/${id}`);
      return res.data;
    },
    enabled: !!id,
    retry: false,
  });

  const { ydoc, provider, isSynced } = useBoardCollaboration(id || '');

  if (isLoading) {
    return (
      <div className="relative flex flex-col h-dvh bg-background">
        <DottedBackground />
        <div className="flex items-center justify-center flex-1">
          <div className="size-6 animate-spin rounded-full border-2 border-grey-200 border-t-primary-500" />
        </div>
      </div>
    );
  }

  if (error || !board) {
    return (
      <div className="relative flex items-center justify-center h-dvh bg-background">
        <DottedBackground />
        <div className="z-10 text-center">
          <h2 className="text-xl font-semibold text-foreground-heading mb-sm">
            Board nicht verfügbar
          </h2>
          <p className="text-grey-500 mb-md">Dieses Board ist nicht öffentlich zugänglich.</p>
          <button
            onClick={() => navigate('/')}
            className="px-4 py-2 text-sm font-medium rounded-lg bg-primary-600 text-white hover:bg-primary-700 border-none cursor-pointer transition-colors"
          >
            Zur Startseite
          </button>
        </div>
      </div>
    );
  }

  if (board.share_mode === 'authenticated') {
    return (
      <div className="relative flex items-center justify-center h-dvh bg-background">
        <DottedBackground />
        <div className="z-10 text-center">
          <h2 className="text-xl font-semibold text-foreground-heading mb-sm">{board.title}</h2>
          <p className="text-grey-500 mb-md">Dieses Board erfordert eine Anmeldung.</p>
          <button
            onClick={() => navigate(`/boards/${id}`)}
            className="px-4 py-2 text-sm font-medium rounded-lg bg-primary-600 text-white hover:bg-primary-700 border-none cursor-pointer transition-colors"
          >
            Anmelden
          </button>
        </div>
      </div>
    );
  }

  const boardType = getBoardType(board);
  const isWhiteboard = boardType === 'whiteboard';
  const isReadOnly = board.share_permission === 'viewer';

  return (
    <div className="relative flex flex-col h-dvh bg-background">
      {!isWhiteboard && <DottedBackground />}
      <div className="z-10 flex w-full items-center justify-between px-sm py-xs">
        <div className="flex items-center gap-sm">
          <h1 className="text-sm font-bold tracking-tight text-foreground-heading m-0 truncate">
            {board.title}
          </h1>
          {isReadOnly && (
            <span className="text-xs text-grey-400 bg-grey-100 dark:bg-grey-800 px-2 py-0.5 rounded">
              Nur Ansicht
            </span>
          )}
        </div>
      </div>
      {isWhiteboard ? (
        <Suspense
          fallback={
            <div className="flex-1 flex items-center justify-center">
              <div className="size-6 animate-spin rounded-full border-2 border-grey-200 border-t-primary-500" />
            </div>
          }
        >
          <LazyExcalidrawBoard ydoc={ydoc} provider={provider} isSynced={isSynced} />
        </Suspense>
      ) : (
        <PublicKanbanContent ydoc={ydoc} isSynced={isSynced} provider={provider} />
      )}
    </div>
  );
}

const noop = () => {};

function PublicKanbanContent({
  ydoc,
  isSynced,
  provider,
}: {
  ydoc: Doc;
  isSynced: boolean;
  provider: HocuspocusProvider | null;
}) {
  const boardState = useBoardState(ydoc, isSynced, null);
  const [activeViewId] = useState('view-kanban-default');

  const { activeView, fields, groups } = useViewData({
    fields: boardState.fields,
    rows: boardState.rows,
    views: boardState.views,
    activeViewId,
  });

  return (
    <PlannerKanban
      fields={fields}
      groups={groups}
      activeView={activeView}
      onDragReorder={noop}
      addRow={noop}
      updateRow={noop}
      updateRowCell={noop}
      deleteRow={noop}
      updateField={noop}
      removeField={noop}
      currentUserId=""
      provider={provider}
    />
  );
}

export default function PublicBoardPage() {
  return (
    <DocsProvider adapter={webAppDocsAdapter}>
      <ErrorBoundary>
        <PublicBoardContent />
      </ErrorBoundary>
    </DocsProvider>
  );
}
