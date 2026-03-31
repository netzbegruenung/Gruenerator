import {
  CardActionsMenu,
  CardGrid,
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  SectionHeader,
  Skeleton,
  VideoCard,
} from '@gruenerator/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import React, { memo, useCallback } from 'react';
import { FaImage, FaVideo } from 'react-icons/fa';
import {
  FiCalendar,
  FiCheckSquare,
  FiClipboard,
  FiEdit3,
  FiFile,
  FiFileText,
  FiMail,
  FiMonitor,
  FiRadio,
} from 'react-icons/fi';
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
import { formatRelativeDate } from '../../../utils/dateFormatter';
import { useBoards } from '../../boards/hooks/useBoards';

const DocsIcon = getIcon('navigation', 'docs');
const BoardIcon = getIcon('navigation', 'boards');

const DOC_SUBTYPE_STYLE: Record<
  string,
  { icon: React.ComponentType<{ size?: number; className?: string }>; bg: string; text: string }
> = {
  blank: { icon: FiFile, bg: 'bg-grey-100 dark:bg-grey-800', text: 'text-grey-500' },
  antrag: {
    icon: FiFileText,
    bg: 'bg-blue-100 dark:bg-blue-900/30',
    text: 'text-blue-600 dark:text-blue-400',
  },
  pressemitteilung: {
    icon: FiRadio,
    bg: 'bg-amber-100 dark:bg-amber-900/30',
    text: 'text-amber-600 dark:text-amber-400',
  },
  protokoll: {
    icon: FiClipboard,
    bg: 'bg-violet-100 dark:bg-violet-900/30',
    text: 'text-violet-600 dark:text-violet-400',
  },
  notizen: {
    icon: FiEdit3,
    bg: 'bg-yellow-100 dark:bg-yellow-900/30',
    text: 'text-yellow-600 dark:text-yellow-400',
  },
  redaktionsplan: {
    icon: FiCalendar,
    bg: 'bg-teal-100 dark:bg-teal-900/30',
    text: 'text-teal-600 dark:text-teal-400',
  },
  checkliste: {
    icon: FiCheckSquare,
    bg: 'bg-green-100 dark:bg-green-900/30',
    text: 'text-green-600 dark:text-green-400',
  },
  einladung: {
    icon: FiMail,
    bg: 'bg-rose-100 dark:bg-rose-900/30',
    text: 'text-rose-600 dark:text-rose-400',
  },
};

type RecentItemType = 'doc' | 'board' | 'image' | 'video' | 'text' | 'presentation';

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
  presentation: 'Neue Präsentation',
};

const TYPE_ICONS: Record<RecentItemType, React.ComponentType<{ className?: string }> | null> = {
  doc: DocsIcon ?? null,
  board: BoardIcon ?? null,
  image: FaImage,
  video: FaVideo,
  text: HiOutlineDocumentText,
  presentation: FiMonitor,
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
    const isDoc = item.type === 'doc';
    const docStyle = isDoc
      ? (DOC_SUBTYPE_STYLE[item.documentType ?? 'blank'] ?? DOC_SUBTYPE_STYLE.blank)
      : null;
    const DocTypeIcon = docStyle?.icon;
    const hasDocContent = isDoc && !!item.content?.trim();

    const cardClass = cn(
      'group relative flex flex-col bg-background border border-grey-200 dark:border-grey-700 overflow-hidden cursor-pointer transition-all duration-200 ease-out hover:-translate-y-0.5 hover:shadow-md hover:border-grey-300 dark:hover:border-grey-600 no-underline',
      isDoc ? 'rounded-xl aspect-[4/4.5] max-sm:aspect-[4/3]' : 'rounded-md'
    );

    const cardContent = (
      <>
        {isDoc &&
          (hasDocContent ? (
            <div className="relative flex-1 overflow-hidden bg-grey-50 dark:bg-grey-800/50">
              <div
                className={cn(
                  'pointer-events-none w-[800px] origin-top-left scale-[0.3] select-none px-12 py-8',
                  'font-[PT_Sans,Arial,sans-serif] leading-relaxed text-foreground',
                  '[&_h1]:font-[Raleway,PT_Sans,Arial,sans-serif] [&_h1]:text-2xl [&_h1]:font-bold [&_h1]:leading-tight [&_h1]:mb-3 [&_h1]:mt-0',
                  '[&_h2]:font-[Raleway,PT_Sans,Arial,sans-serif] [&_h2]:text-[1.1rem] [&_h2]:font-semibold [&_h2]:leading-snug [&_h2]:mt-3.5 [&_h2]:mb-1.5',
                  '[&_h3]:font-[Raleway,PT_Sans,Arial,sans-serif] [&_h3]:text-[0.95rem] [&_h3]:font-semibold [&_h3]:mt-2.5 [&_h3]:mb-1',
                  '[&_p]:text-[0.8rem] [&_p]:mb-2 [&_p]:mt-0 [&_p]:leading-relaxed',
                  '[&_ul]:text-[0.8rem] [&_ul]:mb-2 [&_ul]:pl-5 [&_ol]:text-[0.8rem] [&_ol]:mb-2 [&_ol]:pl-5',
                  '[&_li]:mb-0.5',
                  '[&_strong]:font-semibold',
                  '[&_em]:italic'
                )}
                dangerouslySetInnerHTML={{ __html: item.content! }}
              />
            </div>
          ) : (
            <div className={`flex flex-1 items-center justify-center pb-10 ${docStyle!.bg}`}>
              {DocTypeIcon && <DocTypeIcon size={32} className={docStyle!.text} />}
            </div>
          ))}
        {item.type === 'board' && (
          <div className="flex items-center justify-center bg-white dark:bg-grey-800 aspect-[4/3] select-none">
            {item.boardType === 'whiteboard' ? (
              <PiPencilLine className="text-2xl text-secondary-600" />
            ) : (
              <PiKanban className="text-2xl text-secondary-600" />
            )}
          </div>
        )}
        {item.type === 'presentation' && (
          <div className="flex items-center justify-center bg-indigo-50 dark:bg-indigo-900/20 aspect-[4/3] select-none">
            <FiMonitor className="text-2xl text-indigo-500 dark:text-indigo-400" />
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

        {isDoc ? (
          <div className="absolute inset-x-0 bottom-0 backdrop-blur-md bg-white/70 dark:bg-grey-900/70 px-2.5 py-2 border-t border-white/50 dark:border-grey-700/50">
            <h3 className="truncate text-xs font-semibold text-foreground m-0">
              {item.title || FALLBACK_TITLES.doc}
            </h3>
            <div className="mt-0.5 flex items-center gap-1 text-[10px] text-grey-500 dark:text-grey-400">
              <span>{formatRelativeDate(item.date)}</span>
              {item.accessType && item.accessType !== 'owner' && (
                <>
                  <span>·</span>
                  <span className="text-primary-600 dark:text-primary-400">
                    {item.creatorName ? `Von ${item.creatorName}` : 'Geteilt'}
                  </span>
                </>
              )}
            </div>
          </div>
        ) : (
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
              {formatRelativeDate(item.date)}
            </p>
          </div>
        )}
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

const RecentReelCard = memo(
  ({
    item,
    onDelete,
    onShare,
  }: {
    item: RecentItem;
    onDelete: (item: RecentItem) => void;
    onShare: (item: RecentItem) => void;
  }) => {
    const navigate = useNavigate();
    const videoId = item.href.includes('project=') ? item.href.split('project=')[1] : item.id;

    return (
      <VideoCard
        src={`/api/subtitler/projects/${videoId}/video`}
        poster={item.thumbnailUrl}
        title={item.title || FALLBACK_TITLES.video}
        duration={item.duration}
        aspect="square"
        onTitleClick={() => navigate(item.href)}
        overlay={
          <div
            className="absolute top-1 right-1 max-sm:opacity-100 opacity-0 group-hover:opacity-100 transition-opacity duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <CardActionsMenu
              onShare={() => onShare(item)}
              onDelete={() => onDelete(item)}
              className="[&_button]:bg-white/80 dark:[&_button]:bg-grey-800/80 [&_button]:backdrop-blur-sm"
            />
          </div>
        }
      />
    );
  }
);
RecentReelCard.displayName = 'RecentReelCard';

const RecentlyCreatedSection: React.FC = memo(() => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: allItems = [], isLoading } = useQuery({
    queryKey: ['recent-activity'],
    queryFn: fetchRecentActivity,
    staleTime: 30_000,
  });

  const items = allItems
    .filter((item) => {
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
        presentation: 'Präsentation wirklich löschen?',
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
          <DropdownMenuItem onClick={handleCreateDoc}>
            <HiOutlineDocumentText />
            Dokument
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleCreateBoard}>
            <PiKanban />
            Board
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleCreateWhiteboard}>
            <PiPencilLine />
            Whiteboard
          </DropdownMenuItem>
          <DropdownMenuSeparator />
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
      <SectionHeader title="Zuletzt erstellt" createLabel="Neu erstellen" createMenu={createMenu} />

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
          {items.map((item) =>
            item.type === 'video' ? (
              <RecentReelCard
                key={`${item.type}-${item.id}`}
                item={item}
                onDelete={handleDelete}
                onShare={handleShare}
              />
            ) : (
              <RecentItemCard
                key={`${item.type}-${item.id}`}
                item={item}
                onDelete={handleDelete}
                onShare={handleShare}
                onConvertText={handleConvertText}
              />
            )
          )}
        </CardGrid>
      )}
    </section>
  );
});

RecentlyCreatedSection.displayName = 'RecentlyCreatedSection';

export default RecentlyCreatedSection;
