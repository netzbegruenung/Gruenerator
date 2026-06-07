import { DocsProvider } from '@gruenerator/docs';
import { Fab } from '@gruenerator/ui';
import { lazy, Suspense, useCallback, useState } from 'react';
import { FiMessageSquare, FiX } from 'react-icons/fi';
import { useLocation, useNavigate, useParams } from 'react-router-dom';

import { DottedBackground } from '../../components/common/DottedBackground';
import withAuthRequired from '../../components/common/LoginRequired/withAuthRequired';
import ErrorBoundary from '../../components/ErrorBoundary';
import { useDocumentTitle } from '../../components/hooks/useDocumentTitle';
import { useBoardsTyped } from '../../hooks/useBoardsTyped';
import useUserDefaults from '../../hooks/useUserDefaults';
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
import { useBoardDetail } from './hooks/useBoardDetail';
import { useBoardState } from './hooks/useBoardState';
import { useViewData } from './hooks/useViewData';
import { FIELD_IDS, getBoardType, isBoardArchived } from './types';

import type { BoardInitialStructure } from './hooks/useBoardState';
import type { Row, ViewLayout } from './types';
import type { HocuspocusProvider } from '@hocuspocus/provider';
import type { Doc } from 'yjs';

const LazyExcalidrawBoard = lazy(() =>
  import('./components/ExcalidrawBoard').then((m) => ({ default: m.ExcalidrawBoard }))
);

const LazyBoardAssistantPanel = lazy(() =>
  import('./BoardAssistantPanel').then((m) => ({ default: m.BoardAssistantPanel }))
);

function BoardContent() {
  const { id } = useParams<{ id: string }>();
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();
  const location = useLocation();
  const { get: getBoardsDefault, set: setBoardsDefault } = useUserDefaults<boolean>('boards');
  const expertMode = getBoardsDefault('expertMode', false);
  const handleExpertModeToggle = useCallback(() => {
    void setBoardsDefault('expertMode', !expertMode);
  }, [expertMode, setBoardsDefault]);

  const generatedStructure =
    (location.state as { generatedStructure?: BoardInitialStructure } | null)?.generatedStructure ??
    null;

  const { data: board, isLoading } = useBoardDetail(id);

  useDocumentTitle(board?.title);

  // useBoardsTyped mutations invalidate ['boards'], which prefix-matches and refreshes
  // this board's detail query (['boards', id]) too.
  const { deleteBoard, updateBoard } = useBoardsTyped();

  const handleDelete = useCallback(() => {
    if (!id) return;
    deleteBoard.mutate(id, { onSuccess: () => void navigate('/workplace') });
  }, [deleteBoard, id, navigate]);
  const handleArchiveToggle = useCallback(() => {
    if (!id) return;
    updateBoard.mutate({ id, is_archived: !board || !isBoardArchived(board) });
  }, [updateBoard, id, board]);
  const handleRename = useCallback(
    (title: string) => {
      if (!id) return;
      updateBoard.mutate({ id, title });
    },
    [updateBoard, id]
  );

  const { ydoc, provider, isConnected, isSynced } = useBoardCollaboration(id || '');

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
        expertMode={expertMode}
        provider={provider}
        onDelete={handleDelete}
        onArchiveToggle={handleArchiveToggle}
        onExpertModeToggle={handleExpertModeToggle}
        onRename={handleRename}
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
          userId={user?.id ? String(user.id) : null}
          userName={user?.display_name ?? null}
          boardId={board.id}
          boardTitle={board.title}
          expertMode={expertMode}
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
  userId,
  userName,
  boardId,
  boardTitle,
  expertMode,
}: {
  ydoc: Doc;
  isSynced: boolean;
  provider: HocuspocusProvider | null;
  generatedStructure: BoardInitialStructure | null;
  currentUserId: string;
  userId: string | null;
  userName: string | null;
  boardId: string;
  boardTitle: string;
  expertMode: boolean;
}) {
  const boardState = useBoardState(ydoc, isSynced, generatedStructure);
  const [activeViewId, setActiveViewId] = useState('view-kanban-default');
  const [selectedRow, setSelectedRow] = useState<Row | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [assistantMounted, setAssistantMounted] = useState(false);

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

  const handleDeleteView = useCallback(
    (viewId: string) => {
      if (boardState.views.length <= 1) return;
      boardState.removeView(viewId);
      if (activeViewId === viewId) {
        const remaining = boardState.views.find((v) => v.id !== viewId);
        if (remaining) setActiveViewId(remaining.id);
      }
    },
    [boardState, activeViewId]
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
      {expertMode && boardState.views.length > 0 && (
        <>
          <ViewSwitcher
            views={boardState.views}
            activeViewId={activeViewId}
            onViewChange={setActiveViewId}
            onAddView={handleAddView}
            onDeleteView={handleDeleteView}
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
          boardId={boardId}
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
          boardId={boardId}
        />
      )}

      {/* AI assistant — only once the board state is synced and a user is present. */}
      {isSynced && userId && (
        <>
          {/* Hidden while the panel is open — the fixed panel overlays the FAB's
              corner (composer/send button), and the panel has its own close button. */}
          {!assistantOpen && (
            <Fab
              icon={<FiMessageSquare />}
              aria-label="KI-Board-Assistent öffnen"
              title="KI-Board-Assistent"
              onClick={() => {
                setAssistantMounted(true);
                setAssistantOpen(true);
              }}
            />
          )}
          {assistantMounted && (
            <aside
              className={
                assistantOpen
                  ? 'fixed top-0 right-0 bottom-0 w-80 min-w-80 max-w-80 z-[200] flex flex-col border-l border-grey-200 dark:border-grey-700 bg-background dark:bg-grey-900 overflow-hidden shadow-xl max-md:w-full max-md:min-w-full max-md:max-w-full max-md:border-l-0'
                  : 'hidden'
              }
            >
              <div className="flex items-center justify-end p-2 border-b border-grey-200 dark:border-grey-700 shrink-0">
                <button
                  onClick={() => setAssistantOpen(false)}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-grey-600 hover:bg-grey-100 hover:text-foreground dark:text-grey-300 dark:hover:bg-grey-700"
                  aria-label="Assistent schließen"
                >
                  <FiX size={18} />
                </button>
              </div>
              <div className="flex-1 min-h-0">
                <Suspense fallback={null}>
                  <LazyBoardAssistantPanel
                    boardId={boardId}
                    userId={userId}
                    userName={userName}
                    boardTitle={boardTitle}
                    boardState={boardState}
                    isOpen={assistantOpen}
                  />
                </Suspense>
              </div>
            </aside>
          )}
        </>
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
