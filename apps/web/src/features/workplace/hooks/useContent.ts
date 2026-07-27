import { type ContentItem, type ContentKind, type VideoContentItem } from '@gruenerator/contracts';
import { getContractsClient } from '@gruenerator/shared/api';
import { useQuery } from '@tanstack/react-query';

export type { ContentItem, ContentKind };
/** What the Reels strip renders. Narrowed off the union, not re-declared. */
export type ReelItem = VideoContentItem;

/**
 * `GET /api/content`, filtered server-side by kind.
 *
 * The difference to `useRecentActivity` is not cosmetic. That hook fetches one
 * merged feed and every section filters it client-side — so a section only sees
 * whatever survived the server's merge-then-truncate. An account with thirty
 * fresh documents gets an empty Reels strip even with dozens of reels, because
 * none of them made the cut. Asking for `kind=video` puts the limit on the reels
 * themselves.
 *
 * Each kind combination gets its own cache entry; nothing here writes to
 * `['recent-activity']`, so the two coexist while surfaces migrate one at a time.
 */
export function contentQueryKey(kinds: readonly ContentKind[], limit: number) {
  return ['content', [...kinds].sort().join(','), limit] as const;
}

export interface UseContentResult {
  items: ContentItem[];
  /** Kinds the server could not read. Empty is the normal case. */
  degraded: ContentKind[];
  nextCursor: string | null;
}

export function useContent(kinds: readonly ContentKind[], limit: number) {
  return useQuery({
    queryKey: contentQueryKey(kinds, limit),
    queryFn: async (): Promise<UseContentResult> => {
      const res = await getContractsClient().content.listContent({
        query: { kind: kinds.join(','), limit: String(limit) },
      });
      if (res.status !== 200) {
        throw new Error('Inhalte konnten nicht geladen werden.');
      }
      return res.body;
    },
    staleTime: 30_000,
  });
}

const REELS_LIMIT = 5;

export const REELS_QUERY_KEY = contentQueryKey(['video'], REELS_LIMIT);

/**
 * The Reels strip on /studio. The one consumer that proves the point of the
 * endpoint: it asks for reels and gets reels, however busy the rest of the
 * account is.
 */
export function useReels() {
  const query = useContent(['video'], REELS_LIMIT);
  const items = query.data?.items ?? [];
  return {
    ...query,
    // The discriminant does the narrowing; nothing here casts.
    reels: items.filter((item): item is ReelItem => item.kind === 'video'),
    failed: (query.data?.degraded ?? []).includes('video'),
  };
}
