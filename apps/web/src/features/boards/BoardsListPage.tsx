import { useState } from 'react';
import { HiDotsVertical, HiOutlineTrash, HiShare, HiUserGroup } from 'react-icons/hi';
import { PiPencilLine, PiStar, PiStarFill } from 'react-icons/pi';
import { useNavigate } from 'react-router-dom';

import withAuthRequired from '../../components/common/LoginRequired/withAuthRequired';
import PageContainer from '../../components/common/PageContainer';
import ErrorBoundary from '../../components/ErrorBoundary';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '../../components/ui/dropdown-menu';
import apiClient from '../../components/utils/apiClient';
import { getIcon } from '../../config/icons';
import { useGroups } from '../../features/groups/hooks/useGroups';
import useSidebarFavouritesStore from '../../stores/sidebarFavouritesStore';
import { cn } from '../../utils/cn';

import { AIBoardCreator } from './components/AIBoardCreator';
import { useBoards } from './hooks/useBoards';
import { getBoardType } from './types';

import type { Board } from './types';

const BoardIcon = getIcon('navigation', 'boards');

function BoardsListPage() {
  const navigate = useNavigate();
  const { boards, archivedBoards, isLoading, deleteBoard } = useBoards();
  const { userGroups = [] } = useGroups({ isActive: true });
  const { isFavourite, toggleFavourite } = useSidebarFavouritesStore();
  const [tab, setTab] = useState<'active' | 'archived'>('active');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [sharedInfo, setSharedInfo] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleShareLink = (boardId: string) => {
    navigator.clipboard.writeText(`${window.location.origin}/boards/${boardId}`);
    setCopiedId(boardId);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleShareToGroup = async (boardId: string, groupId: string) => {
    try {
      await apiClient.post(`/auth/groups/${groupId}/share`, {
        contentType: 'collaborative_documents',
        contentId: boardId,
        permissions: { read: true, write: false, collaborative: false },
      });
      setSharedInfo(boardId);
      setTimeout(() => setSharedInfo(null), 2000);
    } catch {
      // best-effort
    }
  };

  const handleDelete = async (board: Board) => {
    if (window.confirm(`Board "${board.title}" wirklich löschen?`)) {
      setDeletingId(board.id);
      try {
        await deleteBoard.mutateAsync(board.id);
      } finally {
        setDeletingId(null);
      }
    }
  };

  const displayedBoards = tab === 'active' ? boards : archivedBoards;

  return (
    <ErrorBoundary>
      <PageContainer
        title="Boards"
        subtitle="Beschreibe dein Projekt und die KI erstellt ein Board mit passenden Spalten und Aufgaben."
        maxWidth="md"
      >
        <AIBoardCreator />

        {archivedBoards.length > 0 && (
          <div className="flex gap-1 mb-md">
            <button
              onClick={() => setTab('active')}
              className={cn(
                'px-3 py-1.5 text-sm font-medium rounded-md border-none cursor-pointer transition-colors',
                tab === 'active'
                  ? 'bg-grey-200 dark:bg-grey-700 text-foreground'
                  : 'bg-transparent text-grey-500 hover:text-foreground hover:bg-grey-100 dark:hover:bg-grey-800'
              )}
            >
              Aktiv ({boards.length})
            </button>
            <button
              onClick={() => setTab('archived')}
              className={cn(
                'px-3 py-1.5 text-sm font-medium rounded-md border-none cursor-pointer transition-colors',
                tab === 'archived'
                  ? 'bg-grey-200 dark:bg-grey-700 text-foreground'
                  : 'bg-transparent text-grey-500 hover:text-foreground hover:bg-grey-100 dark:hover:bg-grey-800'
              )}
            >
              Archiviert ({archivedBoards.length})
            </button>
          </div>
        )}

        {isLoading ? (
          <div className="flex items-center gap-sm py-md">
            <div className="size-4 animate-spin rounded-full border-2 border-grey-200 border-t-primary-500" />
            <span className="text-sm text-foreground">Laden...</span>
          </div>
        ) : (
          <div className="grid grid-cols-2 max-sm:grid-cols-1 gap-sm">
            {displayedBoards.map((board) => (
              <div
                key={board.id}
                role="button"
                tabIndex={0}
                className="group flex items-center gap-sm bg-background border border-grey-200 dark:border-grey-700 rounded-md px-md py-md min-h-[4rem] cursor-pointer transition-all duration-300 ease-out hover:-translate-y-0.5 hover:shadow-md"
                onClick={() => navigate(`/boards/${board.id}`)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    navigate(`/boards/${board.id}`);
                  }
                }}
              >
                {getBoardType(board) === 'whiteboard' ? (
                  <PiPencilLine className="text-base text-secondary-600 shrink-0" />
                ) : (
                  BoardIcon && <BoardIcon className="text-base text-secondary-600 shrink-0" />
                )}
                <div className="flex flex-col flex-1 min-w-0">
                  <span className="text-sm font-medium text-foreground-heading truncate">
                    {board.title}
                  </span>
                  <span className="text-xs text-grey-400">
                    {board.creator_name && `${board.creator_name} · `}
                    {new Date(board.updated_at).toLocaleDateString('de-DE', {
                      day: '2-digit',
                      month: 'short',
                    })}
                  </span>
                </div>
                <div
                  className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => e.stopPropagation()}
                >
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        className="flex items-center justify-center w-6 h-6 rounded-full text-grey-400 hover:text-foreground transition-colors cursor-pointer"
                        aria-label="Aktionen"
                      >
                        <HiDotsVertical size={14} />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => toggleFavourite(board.id)}>
                        {isFavourite(board.id) ? (
                          <PiStarFill className="text-primary-600" />
                        ) : (
                          <PiStar />
                        )}
                        {isFavourite(board.id) ? 'Aus Favoriten entfernen' : 'Zu Favoriten'}
                      </DropdownMenuItem>
                      <DropdownMenuSub>
                        <DropdownMenuSubTrigger>
                          <HiShare />
                          {sharedInfo === board.id ? 'Geteilt!' : 'Teilen'}
                        </DropdownMenuSubTrigger>
                        <DropdownMenuSubContent>
                          <DropdownMenuItem onClick={() => handleShareLink(board.id)}>
                            <HiShare />
                            {copiedId === board.id ? 'Link kopiert!' : 'Link kopieren'}
                          </DropdownMenuItem>
                          {(userGroups as { id: string; name: string }[]).length > 0 && (
                            <>
                              <DropdownMenuSeparator />
                              {(userGroups as { id: string; name: string }[]).map((group) => (
                                <DropdownMenuItem
                                  key={group.id}
                                  onClick={() => handleShareToGroup(board.id, group.id)}
                                >
                                  <HiUserGroup />
                                  {group.name}
                                </DropdownMenuItem>
                              ))}
                            </>
                          )}
                        </DropdownMenuSubContent>
                      </DropdownMenuSub>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem variant="destructive" onClick={() => handleDelete(board)}>
                        <HiOutlineTrash />
                        {deletingId === board.id ? 'Wird gelöscht...' : 'Löschen'}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            ))}

            {displayedBoards.length === 0 && (
              <div className="text-center py-2xl text-grey-500">
                {tab === 'active' ? (
                  <>
                    <p className="text-lg mb-sm">Noch keine Boards vorhanden.</p>
                    <p>Erstelle dein erstes Board, um loszulegen!</p>
                  </>
                ) : (
                  <p className="text-lg">Keine archivierten Boards.</p>
                )}
              </div>
            )}
          </div>
        )}
      </PageContainer>
    </ErrorBoundary>
  );
}

export default withAuthRequired(BoardsListPage, {
  title: 'Boards',
});
