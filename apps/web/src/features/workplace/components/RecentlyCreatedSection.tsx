import { getShareUrl } from '@gruenerator/shared';
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
import React, { memo, useCallback, useMemo } from 'react';
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
import { getBoardType } from '../../boards/types';
import useRecentDocs from '../hooks/useRecentDocs';

import type { Share } from '@gruenerator/shared';

const DocsIcon = getIcon('navigation', 'docs');
const BoardIcon = getIcon('navigation', 'boards');

const dateFormat: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'short' };

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

type RecentItemType = 'doc' | 'board' | 'image' | 'video';

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
  shareToken?: string;
  creatorName?: string;
  accessType?: string;
}

const formatDuration = (seconds?: number): string => {
  if (!seconds) return '';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${String(secs).padStart(2, '0')}`;
};

const fetchShares = async (type: string): Promise<Share[]> => {
  try {
    const res = await apiClient.get('/share/my', { params: { type } });
    return res.data?.shares ?? [];
  } catch {
    return [];
  }
};

const FALLBACK_TITLES: Record<RecentItemType, string> = {
  doc: 'Unbenanntes Dokument',
  board: 'Unbenanntes Board',
  image: 'Ohne Titel',
  video: 'Ohne Titel',
};

const TYPE_ICONS: Record<RecentItemType, React.ComponentType<{ className?: string }> | null> = {
  doc: DocsIcon ?? null,
  board: BoardIcon ?? null,
  image: FaImage,
  video: FaVideo,
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
  }: {
    item: RecentItem;
    onDelete: (item: RecentItem) => void;
    onShare: (item: RecentItem) => void;
  }) => {
    const isDocOrBoard = item.type === 'doc' || item.type === 'board';

    const TypeIcon = TYPE_ICONS[item.type];

    return (
      <Link
        to={item.href}
        className="group relative flex flex-col bg-background border border-grey-200 dark:border-grey-700 rounded-md overflow-hidden cursor-pointer transition-all duration-200 ease-out hover:-translate-y-0.5 hover:shadow-md hover:border-grey-300 dark:hover:border-grey-600 no-underline"
      >
        {/* Preview area */}
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

        {/* Actions menu */}
        <div
          className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200"
          onClick={(e) => e.preventDefault()}
        >
          <CardActionsMenu
            onShare={() => onShare(item)}
            onDelete={() => onDelete(item)}
            className="[&_button]:bg-white/80 dark:[&_button]:bg-grey-800/80 [&_button]:backdrop-blur-sm"
          >
            {isDocOrBoard && <FavouriteMenuItem id={item.id} />}
          </CardActionsMenu>
        </div>

        {/* Footer */}
        <div className="border-t border-grey-100 dark:border-grey-700 px-sm py-sm">
          <div className="flex items-center gap-xs min-w-0">
            {TypeIcon && <TypeIcon className="text-sm text-secondary-600 shrink-0" />}
            <span className="text-sm font-medium text-foreground-heading truncate">
              {item.title || FALLBACK_TITLES[item.type]}
            </span>
          </div>
          <p className="text-xs text-grey-400 mt-0.5 m-0 truncate">
            {item.accessType && item.accessType !== 'owner' && item.creatorName
              ? `Von ${item.creatorName} · `
              : ''}
            {new Date(item.date).toLocaleDateString('de-DE', dateFormat)}
          </p>
        </div>
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

    const { docs, isLoading: docsLoading } = useRecentDocs(10, showDocs);
    const {
      boards,
      isLoading: boardsLoading,
      createBoard,
      deleteBoard,
    } = useBoards({
      enabled: showBoards,
    });

    const { data: images = [], isLoading: imagesLoading } = useQuery({
      queryKey: ['shares', 'image'],
      queryFn: () => fetchShares('image'),
      staleTime: 30_000,
    });

    const { data: videos = [], isLoading: videosLoading } = useQuery({
      queryKey: ['shares', 'video'],
      queryFn: () => fetchShares('video'),
      staleTime: 30_000,
    });

    const isLoading =
      (showDocs && docsLoading) || (showBoards && boardsLoading) || imagesLoading || videosLoading;

    const createEmptyDoc = useMutation({
      mutationFn: async () => {
        const res = await apiClient.post('/docs', { title: 'Neues Dokument' });
        return res.data as { id: string };
      },
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['workplace-recent-docs'] });
      },
    });

    const items = useMemo(() => {
      const unified: RecentItem[] = [];

      docs.forEach((doc) => {
        unified.push({
          id: doc.id,
          title: doc.title,
          date: doc.updated_at,
          type: 'doc',
          emoji: SUBTYPE_EMOJI[doc.document_subtype ?? 'blank'] ?? '📄',
          creatorName: doc.creator_name,
          accessType: doc.access_type,
          href: `/docs/${doc.id}`,
        });
      });

      boards.forEach((board) => {
        unified.push({
          id: board.id,
          title: board.title,
          date: board.updated_at,
          type: 'board',
          boardType: getBoardType(board),
          creatorName: board.creator_name,
          href: `/boards/${board.id}`,
        });
      });

      images.forEach((share) => {
        unified.push({
          id: share.shareToken,
          title: share.title,
          date: share.createdAt,
          type: 'image',
          thumbnailUrl: share.thumbnailUrl || getShareUrl(share.shareToken, 'thumbnail'),
          shareToken: share.shareToken,
          href: '/studio/gallery',
        });
      });

      videos.forEach((share) => {
        unified.push({
          id: share.shareToken,
          title: share.title,
          date: share.createdAt,
          type: 'video',
          thumbnailUrl: share.thumbnailUrl || getShareUrl(share.shareToken, 'thumbnail'),
          duration: share.duration,
          shareToken: share.shareToken,
          href: `/shared/${share.shareToken}`,
        });
      });

      unified.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      return unified.slice(0, 9);
    }, [docs, boards, images, videos]);

    const handleDelete = useCallback(
      (item: RecentItem) => {
        const messages: Record<RecentItemType, string> = {
          doc: 'Dokument wirklich löschen?',
          board: 'Board wirklich löschen?',
          image: 'Bild wirklich löschen?',
          video: 'Video wirklich löschen?',
        };

        if (!window.confirm(messages[item.type])) return;

        switch (item.type) {
          case 'doc':
            apiClient.delete(`/docs/${item.id}`).then(() => {
              queryClient.invalidateQueries({ queryKey: ['workplace-recent-docs'] });
            });
            break;
          case 'board':
            deleteBoard.mutateAsync(item.id);
            break;
          case 'image':
          case 'video':
            apiClient.delete(`/share/${item.shareToken}`).then(() => {
              queryClient.invalidateQueries({ queryKey: ['shares', item.type] });
            });
            break;
        }
      },
      [deleteBoard, queryClient]
    );

    const handleShare = useCallback((item: RecentItem) => {
      if (item.shareToken) {
        navigator.clipboard.writeText(getShareUrl(item.shareToken));
      } else {
        const url =
          item.type === 'board'
            ? `${window.location.origin}/boards/${item.id}`
            : `${window.location.origin}/docs/${item.id}`;
        navigator.clipboard.writeText(url);
      }
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
          <CardGrid columns="3">
            {Array.from({ length: 6 }, (_, i) => (
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
          <CardGrid columns="3">
            {items.map((item) => (
              <RecentItemCard
                key={`${item.type}-${item.id}`}
                item={item}
                onDelete={handleDelete}
                onShare={handleShare}
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
