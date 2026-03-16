import { DocsProvider } from '@gruenerator/docs';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { lazy, Suspense, useCallback, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';

import { DottedBackground } from '../../components/common/DottedBackground';
import withAuthRequired from '../../components/common/LoginRequired/withAuthRequired';
import ErrorBoundary from '../../components/ErrorBoundary';
import apiClient from '../../components/utils/apiClient';
import { useAuthStore } from '../../stores/authStore';
import { webAppDocsAdapter } from '../docs/docsAdapter';

import { BoardCalendarView } from './components/BoardCalendarView';
import { BoardGanttView } from './components/BoardGanttView';
import { BoardInlineHeader } from './components/BoardInlineHeader';
import { BoardListView } from './components/BoardListView';
import { BoardTableView } from './components/BoardTableView';
import { CardDetailPanel } from './components/CardDetailPanel';
import { PlannerKanban } from './components/PlannerKanban';
import { ViewSwitcher } from './components/ViewSwitcher';
import { ViewToolbar } from './components/ViewToolbar';
import { useBoardCollaboration } from './hooks/useBoardCollaboration';
import { useBoardSharing } from './hooks/useBoardSharing';
import { useBoardState } from './hooks/useBoardState';
import { useViewData } from './hooks/useViewData';
import { FIELD_IDS, getBoardType, isBoardArchived } from './types';

import type { BoardInitialStructure } from './hooks/useBoardState';
import type { Board, Row, ViewLayout } from './types';
import type { HocuspocusProvider } from '@hocuspocus/provider';
import type { Doc } from 'yjs';

const LazyExcalidrawBoard = lazy(() =>
  import('./components/ExcalidrawBoard').then((m) => ({ default: m.ExcalidrawBoard }))
);

function BoardContent() {
  const { id } = useParams<{ id: string }>();
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();

  const generatedStructure =
    (location.state as { generatedStructure?: BoardInitialStructure } | null)?.generatedStructure ??
    null;

  const { data: board, isLoading } = useQuery<Board>({
    queryKey: ['boards', id],
    queryFn: async () => {
      const res = await apiClient.get(`/boards/${id}`);
      return res.data;
    },
    enabled: !!id,
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      await apiClient.delete(`/boards/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['boards'] });
      navigate('/boards');
    },
  });

  const archiveMutation = useMutation({
    mutationFn: async (isArchived: boolean) => {
      await apiClient.put(`/boards/${id}`, { is_archived: isArchived });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['boards'] });
      queryClient.invalidateQueries({ queryKey: ['boards', id] });
    },
  });

  const handleDelete = useCallback(() => deleteMutation.mutate(), [deleteMutation]);
  const handleArchiveToggle = useCallback(
    () => archiveMutation.mutate(!board || !isBoardArchived(board)),
    [archiveMutation, board]
  );

  const { ydoc, provider, isConnected, isSynced } = useBoardCollaboration(id || '');
  const { boardGroups } = useBoardSharing(id || '');

  if (isLoading) {
    return (
      <div className="relative flex flex-col h-dvh bg-background">
        <DottedBackground />
        <div className="z-10 p-md sm:p-lg">
          <div className="h-8 w-48 animate-pulse rounded-md bg-grey-200 dark:bg-grey-800 mb-lg" />
          <div className="flex gap-5">
            <div className="h-[400px] w-[280px] animate-pulse rounded-xl bg-grey-100 dark:bg-grey-800/60" />
            <div className="h-[250px] w-[280px] animate-pulse rounded-xl bg-grey-100 dark:bg-grey-800/60" />
            <div className="h-[320px] w-[280px] animate-pulse rounded-xl bg-grey-100 dark:bg-grey-800/60" />
          </div>
        </div>
      </div>
    );
  }

  if (!board) {
    return (
      <div className="relative flex items-center justify-center h-dvh bg-background">
        <DottedBackground />
        <span className="z-10 text-grey-500">Board nicht gefunden</span>
      </div>
    );
  }

  const boardType = getBoardType(board);
  const isWhiteboard = boardType === 'whiteboard';

  return (
    <div className="relative flex flex-col h-dvh bg-background">
      {!isWhiteboard && <DottedBackground />}
      <BoardInlineHeader
        title={board.title}
        boardId={board.id}
        isConnected={isConnected}
        isSynced={isSynced}
        isArchived={isBoardArchived(board)}
        provider={provider}
        onDelete={handleDelete}
        onArchiveToggle={handleArchiveToggle}
        compact={isWhiteboard}
      />
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
        <BoardViewContent
          ydoc={ydoc}
          isSynced={isSynced}
          provider={provider}
          generatedStructure={generatedStructure}
          currentUserId={String(user?.id || '')}
          groupId={boardGroups[0]?.group_id}
        />
      )}
    </div>
  );
}

function BoardViewContent({
  ydoc,
  isSynced,
  provider,
  generatedStructure,
  currentUserId,
  groupId,
}: {
  ydoc: Doc;
  isSynced: boolean;
  provider: HocuspocusProvider | null;
  generatedStructure: BoardInitialStructure | null;
  currentUserId: string;
  groupId?: string;
}) {
  const boardState = useBoardState(ydoc, isSynced, generatedStructure);
  const [activeViewId, setActiveViewId] = useState('view-kanban-default');
  const [selectedRow, setSelectedRow] = useState<Row | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const { activeView, fields, filteredRows, groups } = useViewData({
    fields: boardState.fields,
    rows: boardState.rows,
    views: boardState.views,
    activeViewId,
  });

  const handleAddView = useCallback(
    (layout: ViewLayout) => {
      const id = `view-${layout}-${Date.now()}`;
      const VIEW_NAMES: Record<ViewLayout, string> = {
        kanban: 'Kanban',
        table: 'Tabelle',
        list: 'Liste',
        calendar: 'Kalender',
        gantt: 'Gantt',
      };
      boardState.addView({
        id,
        name: VIEW_NAMES[layout],
        layout,
        groupByFieldId: layout === 'kanban' || layout === 'list' ? FIELD_IDS.STATUS : undefined,
        dateFieldId: layout === 'calendar' || layout === 'gantt' ? FIELD_IDS.DUE_DATE : undefined,
        filters: [],
        sorts: [],
        fieldSettings: boardState.fields.map((f) => ({ fieldId: f.id, visible: true })),
      });
      setActiveViewId(id);
    },
    [boardState]
  );

  const handleRowClick = useCallback((row: Row) => {
    setSelectedRow(row);
    setDetailOpen(true);
  }, []);

  const handleDetailClose = useCallback((open: boolean) => {
    setDetailOpen(open);
  }, []);

  const layout = activeView?.layout ?? 'kanban';

  return (
    <>
      {boardState.views.length > 0 && (
        <>
          <ViewSwitcher
            views={boardState.views}
            activeViewId={activeViewId}
            onViewChange={setActiveViewId}
            onAddView={handleAddView}
          />
          <ViewToolbar
            fields={fields}
            activeView={activeView}
            onUpdateView={boardState.updateView}
          />
        </>
      )}

      {layout === 'kanban' && (
        <PlannerKanban
          fields={fields}
          groups={groups}
          activeView={activeView}
          onDragReorder={boardState.onDragReorder}
          addRow={boardState.addRow}
          updateRow={boardState.updateRow}
          updateRowCell={boardState.updateRowCell}
          deleteRow={boardState.deleteRow}
          updateField={boardState.updateField}
          removeField={boardState.removeField}
          onUpdateView={boardState.updateView}
          currentUserId={currentUserId}
          groupId={groupId}
          provider={provider}
        />
      )}

      {layout === 'table' && (
        <BoardTableView
          fields={fields}
          rows={filteredRows}
          onRowClick={handleRowClick}
          onCellUpdate={boardState.updateRowCell}
        />
      )}

      {layout === 'list' && (
        <BoardListView
          fields={fields}
          groups={groups}
          onRowClick={handleRowClick}
          onCellUpdate={boardState.updateRowCell}
        />
      )}

      {layout === 'calendar' && (
        <BoardCalendarView
          fields={fields}
          rows={filteredRows}
          activeView={activeView}
          onRowClick={handleRowClick}
        />
      )}

      {layout === 'gantt' && (
        <BoardGanttView
          fields={fields}
          rows={filteredRows}
          activeView={activeView}
          onRowClick={handleRowClick}
        />
      )}

      {layout !== 'kanban' && (
        <CardDetailPanel
          row={selectedRow}
          fields={fields}
          open={detailOpen}
          onOpenChange={handleDetailClose}
          onUpdateCell={boardState.updateRowCell}
          onUpdateRow={boardState.updateRow}
          onDelete={boardState.deleteRow}
          onUpdateField={boardState.updateField}
          groupId={groupId}
        />
      )}
    </>
  );
}

function BoardPage() {
  return (
    <DocsProvider adapter={webAppDocsAdapter}>
      <ErrorBoundary>
        <BoardContent />
      </ErrorBoundary>
    </DocsProvider>
  );
}

export default withAuthRequired(BoardPage, {
  title: 'Board',
});
