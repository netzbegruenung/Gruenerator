import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@gruenerator/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  HiDotsVertical,
  HiOutlineDocumentText,
  HiOutlineTrash,
  HiPencil,
  HiPlus,
  HiShare,
  HiUserGroup,
} from 'react-icons/hi';
import { PiPencilLine, PiStar, PiStarFill } from 'react-icons/pi';
import { Link, useNavigate } from 'react-router-dom';

import withAuthRequired from '../../components/common/LoginRequired/withAuthRequired';
import PageContainer from '../../components/common/PageContainer';
import ToolGrid from '../../components/common/ToolGrid';
import ErrorBoundary from '../../components/ErrorBoundary';
import { Separator } from '../../components/ui/separator';
import apiClient from '../../components/utils/apiClient';
import { getIcon } from '../../config/icons';
import useBetaFeatures from '../../hooks/useBetaFeatures';
import useSidebarFavouritesStore from '../../stores/sidebarFavouritesStore';
import { cn } from '../../utils/cn';
import { profileApiService } from '../auth/services/profileApiService';
import { useBoards } from '../boards/hooks/useBoards';
import { getBoardType } from '../boards/types';
import { useGroups, type GroupSummary } from '../groups/hooks/useGroups';

import { UnifiedAICreator } from './components/UnifiedAICreator';
import useRecentDocs from './hooks/useRecentDocs';

import type { ToolEntry } from '../../components/common/ToolGrid';
import type { Board } from '../boards/types';
import type { RecentDoc } from './hooks/useRecentDocs';

const DocsIcon = getIcon('navigation', 'docs');
const BoardIcon = getIcon('navigation', 'boards');

const dateFormat: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'short' };

const createButtonClass =
  'flex items-center justify-center w-7 h-7 rounded-full text-primary-600 hover:bg-primary-600/10 transition-colors cursor-pointer border-none bg-transparent';

const SectionHeader = ({
  title,
  titleHref,
  onCreate,
  createLabel,
}: {
  title: string;
  titleHref?: string;
  onCreate?: () => void;
  createLabel?: string;
}) => (
  <div className="flex items-center justify-between mb-md">
    <div className="flex items-center gap-xs">
      {titleHref ? (
        <a href={titleHref} target="_blank" rel="noopener noreferrer" className="no-underline">
          <h2 className="text-xl font-semibold text-foreground-heading m-0 hover:text-primary-600 transition-colors">
            {title}
          </h2>
        </a>
      ) : (
        <h2 className="text-xl font-semibold text-foreground-heading m-0">{title}</h2>
      )}
      {onCreate && (
        <button
          type="button"
          onClick={onCreate}
          className={createButtonClass}
          aria-label={createLabel ?? 'Neu erstellen'}
        >
          <HiPlus size={18} />
        </button>
      )}
    </div>
  </div>
);

const LoadingSpinner = () => (
  <div className="flex items-center gap-sm py-md">
    <div className="size-4 animate-spin rounded-full border-2 border-grey-200 border-t-primary-500" />
    <span className="text-sm text-foreground">Laden...</span>
  </div>
);

const SUBTYPE_EMOJI: Record<string, string> = {
  blank: '📄',
  antrag: '📋',
  pressemitteilung: '📰',
  protokoll: '📝',
  notizen: '💡',
  redaktionsplan: '📅',
  checkliste: '☑️',
  einladung: '✉️',
};

const DocCard = ({ doc }: { doc: RecentDoc }) => {
  const emoji = SUBTYPE_EMOJI[doc.document_subtype ?? 'blank'] ?? '📄';

  return (
    <Link
      to={`/docs/${doc.id}`}
      className="group flex flex-col bg-background border border-grey-200 dark:border-grey-700 rounded-md overflow-hidden cursor-pointer transition-all duration-200 ease-out hover:-translate-y-0.5 hover:shadow-md hover:border-grey-300 dark:hover:border-grey-600 no-underline"
    >
      <div className="flex items-center justify-center bg-white dark:bg-grey-800 aspect-[4/3] text-4xl select-none">
        {emoji}
      </div>
      <div className="border-t border-grey-100 dark:border-grey-700 px-sm py-sm">
        <div className="flex items-center gap-xs min-w-0">
          {DocsIcon && <DocsIcon className="text-sm text-secondary-600 shrink-0" />}
          <span className="text-sm font-medium text-foreground-heading truncate">
            {doc.title || 'Unbenanntes Dokument'}
          </span>
        </div>
        <p className="text-xs text-grey-400 mt-0.5 m-0 truncate">
          {doc.access_type && doc.access_type !== 'owner' && doc.creator_name
            ? `Von ${doc.creator_name} · `
            : ''}
          {new Date(doc.updated_at).toLocaleDateString('de-DE', dateFormat)}
        </p>
      </div>
    </Link>
  );
};

const BoardCard = ({
  board,
  onClick,
  groups,
  isFavourite,
  onToggleFavourite,
  onDelete,
  isDeleting,
}: {
  board: Board;
  onClick: () => void;
  groups: { id: string; name: string }[];
  isFavourite: boolean;
  onToggleFavourite: () => void;
  onDelete: () => void;
  isDeleting: boolean;
}) => {
  const [copiedId, setCopiedId] = useState(false);
  const [sharedGroupId, setSharedGroupId] = useState<string | null>(null);

  const handleShareLink = () => {
    navigator.clipboard.writeText(`${window.location.origin}/boards/${board.id}`);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
  };

  const handleShareToGroup = async (groupId: string) => {
    try {
      await apiClient.post(`/auth/groups/${groupId}/share`, {
        contentType: 'collaborative_documents',
        contentId: board.id,
        permissions: { read: true, write: false, collaborative: false },
      });
      setSharedGroupId(groupId);
      setTimeout(() => setSharedGroupId(null), 2000);
    } catch {
      // best-effort
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      className="group flex items-center gap-sm bg-background border border-grey-200 dark:border-grey-700 rounded-md px-md py-md min-h-[4rem] cursor-pointer transition-all duration-300 ease-out hover:-translate-y-0.5 hover:shadow-md"
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
    >
      {getBoardType(board) === 'whiteboard' ? (
        <PiPencilLine className="text-base text-secondary-600 shrink-0" />
      ) : (
        BoardIcon && <BoardIcon className="text-base text-secondary-600 shrink-0" />
      )}
      <div className="flex flex-col flex-1 min-w-0">
        <span className="text-sm font-medium text-foreground-heading truncate">{board.title}</span>
        <span className="text-xs text-grey-400">
          {board.creator_name && `${board.creator_name} · `}
          {new Date(board.updated_at).toLocaleDateString('de-DE', dateFormat)}
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
            <DropdownMenuItem onClick={onToggleFavourite}>
              {isFavourite ? <PiStarFill className="text-primary-600" /> : <PiStar />}
              {isFavourite ? 'Aus Favoriten entfernen' : 'Zu Favoriten'}
            </DropdownMenuItem>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <HiShare />
                Teilen
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuItem onClick={handleShareLink}>
                  <HiShare />
                  {copiedId ? 'Link kopiert!' : 'Link kopieren'}
                </DropdownMenuItem>
                {groups.length > 0 && (
                  <>
                    <DropdownMenuSeparator />
                    {groups.map((group) => (
                      <DropdownMenuItem key={group.id} onClick={() => handleShareToGroup(group.id)}>
                        <HiUserGroup />
                        {sharedGroupId === group.id ? 'Geteilt!' : group.name}
                      </DropdownMenuItem>
                    ))}
                  </>
                )}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={onDelete}>
              <HiOutlineTrash />
              {isDeleting ? 'Wird gelöscht...' : 'Löschen'}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
};

const TEXT_TYPE_LABELS: Record<string, string> = {
  text: 'Text',
  antrag: 'Antrag',
  social: 'Social',
  press: 'Presse',
  universal: 'Universal',
  gruene_jugend: 'Grüne Jugend',
};

const TextCard = ({
  text,
  groups,
  onDelete,
  onShareToGroup,
  sharedId,
}: {
  text: { id: string | number; title: string; document_type?: string; content?: string };
  groups: GroupSummary[];
  onDelete: (id: string | number, title: string) => void;
  onShareToGroup: (textId: string | number, groupId: string) => void;
  sharedId: string | number | null;
}) => {
  const navigate = useNavigate();
  const label = TEXT_TYPE_LABELS[text.document_type ?? ''];

  return (
    <div
      role="button"
      tabIndex={0}
      className="group flex flex-col bg-background border border-grey-200 dark:border-grey-700 rounded-md overflow-hidden cursor-pointer transition-all duration-200 ease-out hover:-translate-y-0.5 hover:shadow-md hover:border-grey-300 dark:hover:border-grey-600"
      onClick={() => navigate(`/texte/texteditor?textId=${text.id}`)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          navigate(`/texte/texteditor?textId=${text.id}`);
        }
      }}
    >
      <div className="relative bg-white dark:bg-grey-800 aspect-[4/3] overflow-hidden">
        {text.content ? (
          <div className="w-[600px] origin-top-left scale-[0.25] p-8 pointer-events-none select-none text-foreground font-sans leading-relaxed">
            <p className="text-base whitespace-pre-line">
              {text.content.replace(/<[^>]*>/g, '').slice(0, 500)}
            </p>
          </div>
        ) : (
          <div className="flex items-center justify-center h-full text-4xl select-none">📝</div>
        )}
        <div className="absolute inset-x-0 bottom-0 h-10 bg-gradient-to-b from-transparent to-white dark:to-grey-800 pointer-events-none" />
      </div>
      <div className="border-t border-grey-100 dark:border-grey-700 px-sm py-sm">
        <div className="flex items-center gap-xs min-w-0">
          <HiOutlineDocumentText className="text-sm text-secondary-600 shrink-0" />
          <span className="text-sm font-medium text-foreground-heading truncate flex-1">
            {text.title || 'Ohne Titel'}
          </span>
          <div
            className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
            onClick={(e) => e.stopPropagation()}
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
                <DropdownMenuItem onClick={() => navigate(`/texte/texteditor?textId=${text.id}`)}>
                  <HiPencil />
                  Bearbeiten
                </DropdownMenuItem>
                {groups.length > 0 && (
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger>
                      <HiShare />
                      {sharedId === text.id ? 'Geteilt!' : 'Teilen'}
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent>
                      {groups.map((group) => (
                        <DropdownMenuItem
                          key={group.id}
                          onClick={() => onShareToGroup(text.id, group.id)}
                        >
                          <HiUserGroup />
                          {group.name}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  onClick={() => onDelete(text.id, text.title)}
                >
                  <HiOutlineTrash />
                  Löschen
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
        {label && <p className="text-xs text-grey-400 mt-0.5 m-0">{label}</p>}
      </div>
    </div>
  );
};

const TEXTE_COLLAPSE_THRESHOLD = 10;

const tools: ToolEntry[] = [
  {
    id: 'gruppen',
    title: 'Gruppen',
    description: 'Verwalte deine Gruppen, Mitglieder und geteilte Inhalte.',
    path: '/gruppen',
    icon: getIcon('navigation', 'gruppen'),
    tags: ['Teams', 'Zusammenarbeit'],
  },
  {
    id: 'wolke',
    title: 'Wolke',
    description: 'Nextcloud-Verbindungen und Cloud-Dateien verwalten.',
    path: '/profile/wolke',
    icon: getIcon('actions', 'cloud'),
    tags: ['Nextcloud', 'Dateien'],
  },
  {
    id: 'scanner',
    title: 'Scanner',
    description: 'Dokumente digitalisieren und Texte automatisch extrahieren.',
    path: '/scanner',
    icon: getIcon('navigation', 'scanner'),
    tags: ['OCR', 'PDF'],
    betaFeature: 'scanner',
  },
  {
    id: 'transkription',
    title: 'Transkription',
    description: 'Audio- und Meeting-Aufnahmen automatisch transkribieren.',
    path: '/transkription',
    icon: getIcon('navigation', 'transkription'),
    tags: ['Audio', 'Meetings'],
    betaFeature: 'scanner',
  },
];

const WorkplacePage = () => {
  const navigate = useNavigate();
  const { canAccessBetaFeature } = useBetaFeatures();

  const showDocs = canAccessBetaFeature('docs');
  const showBoards = canAccessBetaFeature('boards');

  const queryClient = useQueryClient();
  const {
    boards,
    archivedBoards,
    isLoading: boardsLoading,
    deleteBoard,
    createBoard,
  } = useBoards({ enabled: showBoards });
  const { docs, isLoading: docsLoading } = useRecentDocs(5, showDocs);
  const { userGroups = [] } = useGroups({ isActive: true });
  const { isFavourite, toggleFavourite } = useSidebarFavouritesStore();

  const [boardTab, setBoardTab] = useState<'active' | 'archived'>('active');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [savedTexts, setSavedTexts] = useState<
    { id: string | number; title: string; document_type?: string; content?: string }[]
  >([]);
  const [textsLoading, setTextsLoading] = useState(false);
  const [textsExpanded, setTextsExpanded] = useState(false);
  const [sharedTextId, setSharedTextId] = useState<string | number | null>(null);

  const fetchTexts = useCallback(async () => {
    setTextsLoading(true);
    try {
      const texts = await profileApiService.getUserTexts();
      setSavedTexts(texts);
    } catch {
      // silent
    } finally {
      setTextsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTexts();
  }, [fetchTexts]);

  const handleTextDelete = useCallback(
    (id: string | number, title: string) => {
      if (window.confirm(`Text "${title}" wirklich löschen?`)) {
        profileApiService.deleteText(id).then(() => fetchTexts());
      }
    },
    [fetchTexts]
  );

  const handleTextShareToGroup = useCallback(async (textId: string | number, groupId: string) => {
    try {
      await apiClient.post(`/auth/groups/${groupId}/share`, {
        contentType: 'user_documents',
        contentId: textId,
        permissions: { read: true, write: false, collaborative: false },
      });
      setSharedTextId(textId);
      setTimeout(() => setSharedTextId(null), 2000);
    } catch {
      // best-effort
    }
  }, []);

  const createEmptyDoc = useMutation({
    mutationFn: async () => {
      const res = await apiClient.post('/docs', { title: 'Neues Dokument' });
      return res.data as { id: string };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workplace-recent-docs'] });
    },
  });

  const handleCreateDoc = useCallback(() => {
    createEmptyDoc.mutate(undefined, {
      onSuccess: (data) => navigate(`/docs/${data.id}`),
    });
  }, [createEmptyDoc, navigate]);

  const handleCreateBoard = useCallback(() => {
    createBoard.mutate(
      { title: 'Neues Board' },
      { onSuccess: (board) => navigate(`/boards/${board.id}`) }
    );
  }, [createBoard, navigate]);

  const displayedBoards = boardTab === 'active' ? boards : archivedBoards;

  const handleDeleteBoard = async (board: Board) => {
    if (window.confirm(`Board "${board.title}" wirklich löschen?`)) {
      setDeletingId(board.id);
      try {
        await deleteBoard.mutateAsync(board.id);
      } finally {
        setDeletingId(null);
      }
    }
  };

  const visibleTools = useMemo(
    () => tools.filter((tool) => !tool.betaFeature || canAccessBetaFeature(tool.betaFeature)),
    [canAccessBetaFeature]
  );

  return (
    <ErrorBoundary>
      <PageContainer
        title="Desk"
        subtitle="Beschreibe dein Vorhaben und die KI erstellt ein Dokument oder Board mit passender Struktur."
        maxWidth="md"
      >
        {(showDocs || showBoards) && <UnifiedAICreator />}

        {showDocs && (
          <section className="mb-xl">
            <SectionHeader
              title="Dokumente"
              titleHref="https://docs.gruenerator.eu"
              onCreate={handleCreateDoc}
              createLabel="Neues Dokument erstellen"
            />
            {docsLoading ? (
              <LoadingSpinner />
            ) : docs.length === 0 ? (
              <p className="text-sm text-grey-500 dark:text-grey-400 py-lg text-center">
                Noch keine Dokumente vorhanden.
              </p>
            ) : (
              <div className="grid grid-cols-5 max-lg:grid-cols-4 max-md:grid-cols-3 max-sm:grid-cols-2 gap-sm">
                {docs.map((doc) => (
                  <DocCard key={doc.id} doc={doc} />
                ))}
              </div>
            )}
          </section>
        )}

        {showBoards && (
          <section className="mb-xl">
            <SectionHeader
              title="Boards"
              onCreate={handleCreateBoard}
              createLabel="Neues Board erstellen"
            />

            {archivedBoards.length > 0 && (
              <div className="flex gap-1 mb-md">
                <button
                  onClick={() => setBoardTab('active')}
                  className={cn(
                    'px-3 py-1.5 text-sm font-medium rounded-md border-none cursor-pointer transition-colors',
                    boardTab === 'active'
                      ? 'bg-grey-200 dark:bg-grey-700 text-foreground'
                      : 'bg-transparent text-grey-500 hover:text-foreground hover:bg-grey-100 dark:hover:bg-grey-800'
                  )}
                >
                  Aktiv ({boards.length})
                </button>
                <button
                  onClick={() => setBoardTab('archived')}
                  className={cn(
                    'px-3 py-1.5 text-sm font-medium rounded-md border-none cursor-pointer transition-colors',
                    boardTab === 'archived'
                      ? 'bg-grey-200 dark:bg-grey-700 text-foreground'
                      : 'bg-transparent text-grey-500 hover:text-foreground hover:bg-grey-100 dark:hover:bg-grey-800'
                  )}
                >
                  Archiviert ({archivedBoards.length})
                </button>
              </div>
            )}

            {boardsLoading ? (
              <LoadingSpinner />
            ) : displayedBoards.length === 0 ? (
              <p className="text-sm text-grey-500 dark:text-grey-400 py-lg text-center">
                {boardTab === 'active'
                  ? 'Noch keine Boards vorhanden.'
                  : 'Keine archivierten Boards.'}
              </p>
            ) : (
              <div className="grid grid-cols-2 max-sm:grid-cols-1 gap-sm">
                {displayedBoards.map((board) => (
                  <BoardCard
                    key={board.id}
                    board={board}
                    onClick={() => navigate(`/boards/${board.id}`)}
                    groups={userGroups as { id: string; name: string }[]}
                    isFavourite={isFavourite(board.id)}
                    onToggleFavourite={() => toggleFavourite(board.id)}
                    onDelete={() => handleDeleteBoard(board)}
                    isDeleting={deletingId === board.id}
                  />
                ))}
              </div>
            )}
          </section>
        )}

        {savedTexts.length > 0 || textsLoading ? (
          <section className="mb-xl">
            <SectionHeader title="Texte" />
            {textsLoading ? (
              <LoadingSpinner />
            ) : (
              <>
                <div className="grid grid-cols-5 max-lg:grid-cols-4 max-md:grid-cols-3 max-sm:grid-cols-2 gap-sm">
                  {(textsExpanded ? savedTexts : savedTexts.slice(0, TEXTE_COLLAPSE_THRESHOLD)).map(
                    (t) => (
                      <TextCard
                        key={t.id}
                        text={t}
                        groups={userGroups as GroupSummary[]}
                        onDelete={handleTextDelete}
                        onShareToGroup={handleTextShareToGroup}
                        sharedId={sharedTextId}
                      />
                    )
                  )}
                </div>
                {savedTexts.length > TEXTE_COLLAPSE_THRESHOLD && (
                  <button
                    type="button"
                    onClick={() => setTextsExpanded(!textsExpanded)}
                    className="mt-sm text-sm text-primary-600 hover:text-primary-500 dark:text-primary-400 dark:hover:text-primary-300 cursor-pointer bg-transparent border-none transition-colors"
                  >
                    {textsExpanded
                      ? 'Weniger anzeigen'
                      : `+${savedTexts.length - TEXTE_COLLAPSE_THRESHOLD} weitere anzeigen`}
                  </button>
                )}
              </>
            )}
          </section>
        ) : null}

        {(showDocs || showBoards || savedTexts.length > 0) && <Separator className="mb-xl" />}

        <section>
          <h2 className="text-xl font-semibold text-foreground-heading mb-md">Weitere Tools</h2>
          <ToolGrid tools={visibleTools} />
        </section>
      </PageContainer>
    </ErrorBoundary>
  );
};

export default withAuthRequired(WorkplacePage, {
  title: 'Desk',
});
