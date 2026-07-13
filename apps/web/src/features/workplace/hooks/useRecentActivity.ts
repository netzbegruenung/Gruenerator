import { type BoardPreview } from '@gruenerator/contracts';
import { useQuery } from '@tanstack/react-query';

import apiClient from '../../../components/utils/apiClient';

export type RecentItemType = 'doc' | 'board' | 'image' | 'video' | 'text' | 'canvas';

export interface RecentItem {
  id: string;
  title: string;
  date: string;
  type: RecentItemType;
  href: string;
  emoji?: string;
  boardType?: 'kanban' | 'whiteboard';
  preview?: BoardPreview;
  thumbnailUrl?: string;
  duration?: number;
  creatorName?: string;
  accessType?: string;
  deleteEndpoint?: string;
  content?: string;
  documentType?: string;
  blurhash?: string;
}

// The cache key every recent-activity consumer shares. It has three writers —
// this query, the ReelsSection strip, and the /auth/init post-login seed — so
// they MUST agree on the fetched shape or the list flickers (a canvas-less
// 12-item seed used to clobber this 30-item fetch). Keeping the queryFn here,
// used by both sections, guarantees the two live fetchers can't diverge; the
// seed is kept in sync separately (it aggregates the same 30 items server-side).
export const RECENT_ACTIVITY_KEY = ['recent-activity'] as const;

// Fetch the backend maximum (capped at 30 server-side) so the "Mehr anzeigen"
// expansion has more than the collapsed grid to reveal without a refetch.
const fetchRecentActivity = async (): Promise<RecentItem[]> => {
  const res = await apiClient.get<{ items?: RecentItem[] }>('/recent-activity', {
    params: { limit: 30 },
  });
  return res.data?.items ?? [];
};

export function useRecentActivity() {
  return useQuery({
    queryKey: RECENT_ACTIVITY_KEY,
    queryFn: fetchRecentActivity,
    staleTime: 30_000,
  });
}
