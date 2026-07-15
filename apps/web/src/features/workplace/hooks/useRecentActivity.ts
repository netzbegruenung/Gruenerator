import { type RecentActivityItem } from '@gruenerator/contracts';
import { getContractsClient } from '@gruenerator/shared/api';
import { useQuery } from '@tanstack/react-query';

// Row shape comes straight from the ts-rest contract — no hand-written mirror.
export type RecentItem = RecentActivityItem;
export type RecentItemType = RecentActivityItem['type'];

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
  const res = await getContractsClient().recentActivity.getRecentActivity({
    query: { limit: '30' },
  });
  if (res.status !== 200) {
    throw new Error('Aktivitäten konnten nicht geladen werden.');
  }
  return res.body.items;
};

export function useRecentActivity() {
  return useQuery({
    queryKey: RECENT_ACTIVITY_KEY,
    queryFn: fetchRecentActivity,
    staleTime: 30_000,
  });
}
