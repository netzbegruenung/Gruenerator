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
import { type RecentItem, useRecentActivity } from '../hooks/useRecentActivity';

const ReelCard = memo(
  ({
    item,
    onDelete,
    onShare,
    onClick,
  }: {
    item: RecentItem;
    onDelete: (item: RecentItem) => void;
    onShare: (item: RecentItem) => void;
    onClick: (item: RecentItem) => void;
  }) => {
    const videoId = item.href.includes('project=') ? item.href.split('project=')[1] : item.id;

    return (
      <VideoCard
        src={resolveApiAssetUrl(`/api/subtitler/projects/${videoId}/video`)}
        poster={resolveApiAssetUrl(item.thumbnailUrl)}
        title={item.title || 'Reel'}
        duration={item.duration}
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

  const { data: allItems = [], isLoading } = useRecentActivity();

  const reels = allItems.filter((item) => item.type === 'video').slice(0, 5);

  const handleDelete = useCallback(
    (item: RecentItem) => {
      if (!window.confirm('Video wirklich löschen?')) return;
      if (!item.deleteEndpoint) return;
      const endpoint = item.deleteEndpoint.replace(/^\/api/, '');
      // Must `.catch()` — bare `.then()` lets rejections escape to
      // `window.onunhandledrejection`, which then routes through Sentry
      // as a pagey-looking "unhandled promise rejection". 401s here are
      // expected when a cached recent-activity entry references a reel
      // the current session no longer owns (post-profile-deletion replay
      // being the most common trigger).
      void apiClient
        .delete(endpoint)
        .then(() => {
          void queryClient.invalidateQueries({ queryKey: ['recent-activity'] });
        })
        .catch((err: unknown) => {
          const status =
            typeof err === 'object' && err !== null && 'response' in err
              ? (err as { response?: { status?: number } }).response?.status
              : undefined;
          console.warn('[ReelsSection] delete failed', { endpoint, status, itemId: item.id });
          if (status === 401 || status === 403 || status === 404) {
            // Entry is stale — drop it from the list so the user isn't
            // stuck clicking a ghost.
            void queryClient.invalidateQueries({ queryKey: ['recent-activity'] });
          }
        });
    },
    [queryClient]
  );

  const handleShare = useCallback((item: RecentItem) => {
    void navigator.clipboard.writeText(`${getPublicAppOrigin()}${item.href}`);
  }, []);

  const handleClick = useCallback((item: RecentItem) => navigate(item.href), [navigate]);

  const handleCreate = useCallback(() => navigate('/studio/video'), [navigate]);

  if (!isLoading && reels.length === 0) return null;

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
