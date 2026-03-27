import {
  CardActionsMenu,
  CardGrid,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  SectionHeader,
  Skeleton,
} from '@gruenerator/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import React, { memo, useCallback } from 'react';
import { FaImage, FaVideo } from 'react-icons/fa';
import { HiOutlineDocumentText } from 'react-icons/hi';
import {
  PiImageSquare,
  PiKanban,
  PiPencilLine,
  PiStar,
  PiStarFill,
  PiVideoCamera,
} from 'react-icons/pi';
import { Link, useNavigate } from 'react-router-dom';

import apiClient from '../../../components/utils/apiClient';
import { getIcon } from '../../../config/icons';
import useSidebarFavouritesStore, { useIsFavourite } from '../../../stores/sidebarFavouritesStore';
import { useBoards } from '../../boards/hooks/useBoards';

const DocsIcon = getIcon('navigation', 'docs');
const BoardIcon = getIcon('navigation', 'boards');

const dateFormat: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'short' };

type RecentItemType = 'doc' | 'board' | 'image' | 'video' | 'text';

interface RecentItem {
  id: string;
  title: string;
  date: string;
  type: RecentItemType;
  href: string;
  emoji?: string;
  boardType?: 'kanban' | 'whiteboard';
  thumbnailUrl?: string;
  duration?: number;
  creatorName?: string;
  accessType?: string;
  deleteEndpoint?: string;
  content?: string;
  documentType?: string;
}

const formatDuration = (seconds?: number): string => {
  if (!seconds) return '';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${String(secs).padStart(2, '0')}`;
};

const fetchRecentActivity = async (): Promise<RecentItem[]> => {
  const res = await apiClient.get('/recent-activity', { params: { limit: 12 } });
  return res.data?.items ?? [];
};

const FALLBACK_TITLES: Record<RecentItemType, string> = {
  doc: 'Unbenanntes Dokument',
  board: 'Unbenanntes Board',
  image: 'Ohne Titel',
  video: 'Ohne Titel',
  text: 'Ohne Titel',
};

const TYPE_ICONS: Record<RecentItemType, React.ComponentType<{ className?: string }> | null> = {
  doc: DocsIcon ?? null,
  board: BoardIcon ?? null,
  image: FaImage,
  video: FaVideo,
  text: HiOutlineDocumentText,
};

const TEXT_TYPE_LABELS: Record<string, string> = {
  text: 'Text',
  antrag: 'Antrag',
  social: 'Social',
  press: 'Presse',
  universal: 'Universal',
};

const FavouriteMenuItem = memo(({ id }: { id: string }) => {
  const starred = useIsFavourite(id);
  const toggleFavourite = useSidebarFavouritesStore((s) => s.toggleFavourite);
  return (
    <DropdownMenuItem onClick={() => toggleFavourite(id)}>
      {starred ? <PiStarFill className="text-primary-600" /> : <PiStar />}
      {starred ? 'Aus Favoriten entfernen' : 'Zu Favoriten'}
    </DropdownMenuItem>
  );
});
FavouriteMenuItem.displayName = 'FavouriteMenuItem';

const RecentItemCard = memo(
  ({
    item,
    onDelete,
    onShare,
    onConvertText,
  }: {
    item: RecentItem;
    onDelete: (item: RecentItem) => void;
    onShare: (item: RecentItem) => void;
    onConvertText?: (textId: string) => void;
  }) => {
    const TypeIcon = TYPE_ICONS[item.type];

    const cardClass =
      'group relative flex flex-col bg-background border border-grey-200 dark:border-grey-700 rounded-md overflow-hidden cursor-pointer transition-all duration-200 ease-out hover:-translate-y-0.5 hover:shadow-md hover:border-grey-300 dark:hover:border-grey-600 no-underline';

    const cardContent = (
      <>
        {item.type === 'doc' && (
          <div className="flex items-center justify-center bg-white dark:bg-grey-800 aspect-[4/3] text-4xl select-none">
            {item.emoji ?? '📄'}
          </div>
        )}
        {item.type === 'board' && (
          <div className="flex items-center justify-center bg-white dark:bg-grey-800 aspect-[4/3] select-none">
            {item.boardType === 'whiteboard' ? (
              <PiPencilLine className="text-2xl text-secondary-600" />
            ) : (
              <PiKanban className="text-2xl text-secondary-600" />
            )}
          </div>
        )}
        {item.type === 'text' && (
          <div className="relative bg-white dark:bg-grey-800 aspect-[4/3] overflow-hidden">
            {item.content ? (
              <div className="w-[600px] origin-top-left scale-[0.25] p-8 pointer-events-none select-none text-foreground font-sans leading-relaxed">
                <p className="text-base whitespace-pre-line">{item.content}</p>
              </div>
            ) : (
              <div className="flex items-center justify-center h-full text-4xl select-none">📝</div>
            )}
            <div className="absolute inset-x-0 bottom-0 h-10 bg-gradient-to-b from-transparent to-white dark:to-grey-800 pointer-events-none" />
          </div>
        )}
        {(item.type === 'image' || item.type === 'video') && (
          <div
            className={`relative ${item.type === 'video' ? 'bg-black' : 'bg-white dark:bg-grey-800'} aspect-[4/3] overflow-hidden`}
          >
            {item.thumbnailUrl ? (
              <img
                src={item.thumbnailUrl}
                alt={item.title || FALLBACK_TITLES[item.type]}
                className="w-full h-full object-cover"
                loading="lazy"
              />
            ) : (
              <div className="flex items-center justify-center h-full text-3xl text-grey-300">
                {item.type === 'video' ? <FaVideo /> : <FaImage />}
              </div>
            )}
            {item.type === 'video' && item.duration && (
              <span className="absolute bottom-1 right-1 bg-black/70 text-white text-[10px] px-1.5 py-0.5 rounded">
                {formatDuration(item.duration)}
              </span>
            )}
          </div>
        )}

        <div
          className="absolute top-1 right-1 max-sm:opacity-100 opacity-0 group-hover:opacity-100 transition-opacity duration-200"
          onClick={(e) => e.preventDefault()}
        >
          <CardActionsMenu
            onShare={() => onShare(item)}
            onDelete={() => onDelete(item)}
            className="[&_button]:bg-white/80 dark:[&_button]:bg-grey-800/80 [&_button]:backdrop-blur-sm"
          >
            {item.type === 'board' && <FavouriteMenuItem id={item.id} />}
          </CardActionsMenu>
        </div>

        <div className="border-t border-grey-100 dark:border-grey-700 px-sm py-sm">
          <div className="flex items-center gap-xs min-w-0">
            {TypeIcon && <TypeIcon className="text-sm text-secondary-600 shrink-0" />}
            <span className="text-sm font-medium text-foreground-heading truncate">
              {item.title || FALLBACK_TITLES[item.type]}
            </span>
          </div>
          <p className="text-xs text-grey-400 mt-0.5 m-0 truncate">
            {item.type === 'text' && item.documentType && TEXT_TYPE_LABELS[item.documentType]
              ? `${TEXT_TYPE_LABELS[item.documentType]} · `
              : ''}
            {item.accessType && item.accessType !== 'owner' && item.creatorName
              ? `Von ${item.creatorName} · `
              : ''}
            {new Date(item.date).toLocaleDateString('de-DE', dateFormat)}
          </p>
        </div>
      </>
    );

    if (item.type === 'text' && onConvertText) {
      return (
        <div
          role="button"
          tabIndex={0}
          className={cardClass}
          onClick={() => onConvertText(item.id)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onConvertText(item.id);
            }
          }}
        >
          {cardContent}
        </div>
      );
    }

    return (
      <Link to={item.href} className={cardClass}>
        {cardContent}
      </Link>
    );
  }
);
RecentItemCard.displayName = 'RecentItemCard';

interface RecentlyCreatedSectionProps {
  showDocs: boolean;
  showBoards: boolean;
}

const RecentlyCreatedSection: React.FC<RecentlyCreatedSectionProps> = memo(
  ({ showDocs, showBoards }) => {
    const navigate = useNavigate();
    const queryClient = useQueryClient();

    const { data: allItems = [], isLoading } = useQuery({
      queryKey: ['recent-activity'],
      queryFn: fetchRecentActivity,
      staleTime: 30_000,
    });

    const items = allItems
      .filter((item) => {
        if (item.type === 'doc' && !showDocs) return false;
        if (item.type === 'board' && !showBoards) return false;
        if (item.type === 'video') return false;
        if (item.type === 'text') return false;
        return true;
      })
      .slice(0, 10);

    const { createBoard, deleteBoard } = useBoards({ enabled: showBoards });

    const createEmptyDoc = useMutation({
      mutationFn: async () => {
        const res = await apiClient.post('/docs', { title: 'Neues Dokument' });
        return res.data as { id: string };
      },
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['recent-activity'] });
      },
    });

    const handleConvertText = useCallback(
      async (textId: string) => {
        try {
          const res = await apiClient.post(`/auth/saved-texts/${textId}/convert-to-doc`);
          const { documentId } = res.data as { documentId: string };
          navigate(`/docs/${documentId}`);
        } catch {
          // fallback to old editor
          navigate(`/texte/texteditor?textId=${textId}`);
        }
      },
      [navigate]
    );

    const handleDelete = useCallback(
      (item: RecentItem) => {
        const messages: Record<RecentItemType, string> = {
          doc: 'Dokument wirklich löschen?',
          board: 'Board wirklich löschen?',
          image: 'Bild wirklich löschen?',
          video: 'Video wirklich löschen?',
          text: 'Text wirklich löschen?',
        };

        if (!window.confirm(messages[item.type])) return;

        if (item.type === 'board') {
          deleteBoard.mutateAsync(item.id).then(() => {
            queryClient.invalidateQueries({ queryKey: ['recent-activity'] });
          });
          return;
        }

        if (item.deleteEndpoint) {
          const endpoint = item.deleteEndpoint.replace(/^\/api/, '');
          apiClient.delete(endpoint).then(() => {
            queryClient.invalidateQueries({ queryKey: ['recent-activity'] });
          });
        }
      },
      [deleteBoard, queryClient]
    );

    const handleShare = useCallback((item: RecentItem) => {
      navigator.clipboard.writeText(`${window.location.origin}${item.href}`);
    }, []);

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

    const handleCreateWhiteboard = useCallback(() => {
      createBoard.mutate(
        { title: 'Neues Whiteboard', boardType: 'whiteboard' },
        { onSuccess: (board) => navigate(`/boards/${board.id}`) }
      );
    }, [createBoard, navigate]);

    const createMenu = useCallback(
      (trigger: React.ReactNode) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {showDocs && (
              <DropdownMenuItem onClick={handleCreateDoc}>
                <HiOutlineDocumentText />
                Dokument
              </DropdownMenuItem>
            )}
            {showBoards && (
              <>
                <DropdownMenuItem onClick={handleCreateBoard}>
                  <PiKanban />
                  Board
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleCreateWhiteboard}>
                  <PiPencilLine />
                  Whiteboard
                </DropdownMenuItem>
              </>
            )}
            {(showDocs || showBoards) && <DropdownMenuSeparator />}
            <DropdownMenuItem onClick={() => navigate('/imagine')}>
              <PiImageSquare />
              Bild erstellen
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate('/studio/video')}>
              <PiVideoCamera />
              Reel / Video erstellen
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
      [showDocs, showBoards, handleCreateDoc, handleCreateBoard, handleCreateWhiteboard, navigate]
    );

    return (
      <section className="mb-xl">
        <SectionHeader
          title="Zuletzt erstellt"
          createLabel="Neu erstellen"
          createMenu={createMenu}
        />

        {isLoading ? (
          <CardGrid columns="5">
            {Array.from({ length: 5 }, (_, i) => (
              <div
                key={i}
                className="rounded-md border border-grey-200 dark:border-grey-700 overflow-hidden"
              >
                <Skeleton className="aspect-[4/3] rounded-none" />
                <div className="px-sm py-sm">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/2 mt-1.5" />
                </div>
              </div>
            ))}
          </CardGrid>
        ) : items.length === 0 ? (
          <p className="text-sm text-grey-500 dark:text-grey-400 py-lg text-center">
            Noch keine Inhalte vorhanden.
          </p>
        ) : (
          <CardGrid columns="5">
            {items.map((item) => (
              <RecentItemCard
                key={`${item.type}-${item.id}`}
                item={item}
                onDelete={handleDelete}
                onShare={handleShare}
                onConvertText={handleConvertText}
              />
            ))}
          </CardGrid>
        )}
      </section>
    );
  }
);

RecentlyCreatedSection.displayName = 'RecentlyCreatedSection';

export default RecentlyCreatedSection;
