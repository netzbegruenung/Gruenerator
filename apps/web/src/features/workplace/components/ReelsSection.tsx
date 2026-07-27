import {
  CardActionsMenu,
  CardGrid,
  DropdownMenuItem,
  SectionHeader,
  Skeleton,
  VideoCard,
} from '@gruenerator/ui';
import { useQueryClient } from '@tanstack/react-query';
import React, { memo, useCallback } from 'react';
import { HiPencil } from 'react-icons/hi';
import { useNavigate } from 'react-router-dom';

import apiClient from '../../../components/utils/apiClient';
import { getPublicAppOrigin, resolveApiAssetUrl } from '../../../utils/platform';
import { REELS_QUERY_KEY, useReels, type ReelItem } from '../hooks/useContent';
import { RECENT_ACTIVITY_KEY } from '../hooks/useRecentActivity';

const ReelCard = memo(
  ({
    item,
    onDelete,
    onShare,
    onClick,
  }: {
    item: ReelItem;
    onDelete: (item: ReelItem) => void;
    onShare: (item: ReelItem) => void;
    onClick: (item: ReelItem) => void;
  }) => {
    return (
      <VideoCard
        src={resolveApiAssetUrl(`/api/subtitler/projects/${item.id}/video`)}
        poster={resolveApiAssetUrl(item.thumbnailUrl ?? undefined)}
        title={item.title || 'Reel'}
        duration={item.duration ?? undefined}
        onClick={() => onClick(item)}
        overlay={
          <div
            className="absolute top-1 right-1 max-sm:opacity-100 opacity-0 group-hover:opacity-100 transition-opacity duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <CardActionsMenu
              onShare={() => onShare(item)}
              onDelete={() => onDelete(item)}
              className="[&_button]:bg-white/80 dark:[&_button]:bg-grey-800/80 [&_button]:backdrop-blur-sm"
            >
              <DropdownMenuItem onClick={() => onClick(item)}>
                <HiPencil />
                Bearbeiten
              </DropdownMenuItem>
            </CardActionsMenu>
          </div>
        }
      />
    );
  }
);
ReelCard.displayName = 'ReelCard';

const ReelsSection: React.FC = memo(() => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Asks for reels instead of filtering them out of a mixed feed. The old call
  // took the merged recent-activity list and kept the videos in it — so an
  // account whose newest items are all documents saw no reels at all.
  const { reels, isLoading, failed } = useReels();

  const invalidate = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: REELS_QUERY_KEY });
    // Other workplace sections still read the merged feed.
    void queryClient.invalidateQueries({ queryKey: RECENT_ACTIVITY_KEY });
  }, [queryClient]);

  const handleDelete = useCallback(
    (item: ReelItem) => {
      if (!window.confirm('Video wirklich löschen?')) return;
      const endpoint = item.deleteEndpoint.replace(/^\/api/, '');
      // Must `.catch()` — bare `.then()` lets rejections escape to
      // `window.onunhandledrejection`, which then routes through Sentry
      // as a pagey-looking "unhandled promise rejection". 401s here are
      // expected when a cached entry references a reel the current session no
      // longer owns (post-profile-deletion replay being the most common
      // trigger).
      void apiClient
        .delete(endpoint)
        .then(invalidate)
        .catch((err: unknown) => {
          const status =
            typeof err === 'object' && err !== null && 'response' in err
              ? (err as { response?: { status?: number } }).response?.status
              : undefined;
          console.warn('[ReelsSection] delete failed', { endpoint, status, itemId: item.id });
          if (status === 401 || status === 403 || status === 404) {
            // Entry is stale — drop it from the list so the user isn't
            // stuck clicking a ghost.
            invalidate();
          }
        });
    },
    [invalidate]
  );

  const handleShare = useCallback((item: ReelItem) => {
    void navigator.clipboard.writeText(`${getPublicAppOrigin()}${item.href}`);
  }, []);

  const handleClick = useCallback((item: ReelItem) => navigate(item.href), [navigate]);

  const handleCreate = useCallback(() => navigate('/studio/video'), [navigate]);

  // `failed` and "none yet" used to be the same thing: the server turned every
  // read error into an empty list. Now a failure keeps the section on screen
  // and says so, instead of quietly pretending the user has no reels.
  if (!isLoading && reels.length === 0 && !failed) return null;

  return (
    <section className="mb-xl">
      <SectionHeader title="Reels" onCreate={handleCreate} createLabel="Neues Reel erstellen" />

      {isLoading ? (
        <CardGrid columns="5">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="rounded-lg overflow-hidden bg-black">
              <Skeleton className="aspect-[9/16] rounded-none" />
            </div>
          ))}
        </CardGrid>
      ) : failed ? (
        <p className="text-sm text-grey-500 dark:text-grey-400">
          Deine Reels konnten gerade nicht geladen werden. Versuch es später noch einmal.
        </p>
      ) : (
        <CardGrid columns="5">
          {reels.map((item) => (
            <ReelCard
              key={item.id}
              item={item}
              onDelete={handleDelete}
              onShare={handleShare}
              onClick={handleClick}
            />
          ))}
        </CardGrid>
      )}
    </section>
  );
});

ReelsSection.displayName = 'ReelsSection';

export default ReelsSection;
