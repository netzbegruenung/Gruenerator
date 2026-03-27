import { CardActionsMenu, CardGrid, SectionHeader, Skeleton, VideoCard } from '@gruenerator/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import React, { memo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

import apiClient from '../../../components/utils/apiClient';

interface RecentItem {
  id: string;
  title: string;
  date: string;
  type: string;
  href: string;
  thumbnailUrl?: string;
  duration?: number;
  deleteEndpoint?: string;
}

const fetchRecentActivity = async (): Promise<RecentItem[]> => {
  const res = await apiClient.get('/recent-activity', { params: { limit: 12 } });
  return res.data?.items ?? [];
};

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
        src={`/api/subtitler/projects/${videoId}/video`}
        poster={item.thumbnailUrl}
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
            />
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

  const { data: allItems = [], isLoading } = useQuery({
    queryKey: ['recent-activity'],
    queryFn: fetchRecentActivity,
    staleTime: 30_000,
  });

  const reels = allItems.filter((item) => item.type === 'video').slice(0, 5);

  const handleDelete = useCallback(
    (item: RecentItem) => {
      if (!window.confirm('Video wirklich löschen?')) return;
      if (item.deleteEndpoint) {
        const endpoint = item.deleteEndpoint.replace(/^\/api/, '');
        void apiClient.delete(endpoint).then(() => {
          void queryClient.invalidateQueries({ queryKey: ['recent-activity'] });
        });
      }
    },
    [queryClient]
  );

  const handleShare = useCallback((item: RecentItem) => {
    void navigator.clipboard.writeText(`${window.location.origin}${item.href}`);
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
