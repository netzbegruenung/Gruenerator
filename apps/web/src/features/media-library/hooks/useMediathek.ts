import {
  type MediathekFilter,
  type MediathekItem,
  type MediathekMediaItem,
} from '@gruenerator/contracts';
import { ApiError, getContractsClient } from '@gruenerator/shared/api';
import {
  mediaApi,
  type MediaImageMetadata,
  type MediaItem,
  type MediaUpdateParams,
  type SortOrder,
  type UploadSource,
} from '@gruenerator/shared/media-library';
import { keepPreviousData, useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';

import apiClient from '../../../components/utils/apiClient';

/**
 * Under `['content']` because the endpoint is `/api/content/mediathek`: a restore
 * from the Papierkorb invalidates that prefix for every kind, Reels and canvases
 * included.
 */
export const MEDIATHEK_QUERY_KEY = ['content', 'mediathek'] as const;

const PAGE_SIZE = 50;

/** The card and dialog components speak `MediaItem`; the wire is a little wider. */
export function toMediaItem({
  kind: _kind,
  duration,
  imageType,
  imageMetadata,
  uploadSource,
  ...rest
}: MediathekMediaItem): MediaItem {
  return {
    ...rest,
    ...(duration != null ? { duration } : {}),
    ...(imageType != null ? { imageType } : {}),
    // Boundary: free JSON from the row, read by the cards as these known keys.
    ...(imageMetadata ? { imageMetadata: imageMetadata as MediaImageMetadata } : {}),
    // Boundary: a TEXT column, validated against UPLOAD_SOURCES on every write.
    uploadSource: uploadSource as UploadSource,
  };
}

export type MediathekEntry =
  { kind: 'media'; id: string; item: MediaItem } | Exclude<MediathekItem, { kind: 'media' }>;

export function useMediathek(filters: { typ: MediathekFilter; search: string; sort: SortOrder }) {
  const queryClient = useQueryClient();
  const query = useInfiniteQuery({
    queryKey: [...MEDIATHEK_QUERY_KEY, filters.typ, filters.search, filters.sort],
    queryFn: async ({ pageParam }) => {
      const res = await getContractsClient().content.listMediathek({
        query: {
          typ: filters.typ,
          sort: filters.sort,
          limit: String(PAGE_SIZE),
          offset: String(pageParam),
          ...(filters.search ? { search: filters.search } : {}),
        },
      });
      if (res.status !== 200) {
        throw new ApiError(res.status, 'Die Mediathek konnte nicht geladen werden.');
      }
      return res.body;
    },
    initialPageParam: 0,
    getNextPageParam: (last) => (last.hasMore ? last.offset + last.limit : undefined),
    // A new search or filter keeps the last result until the next one lands.
    placeholderData: keepPreviousData,
  });

  const entries = useMemo<MediathekEntry[]>(
    () =>
      (query.data?.pages ?? []).flatMap((page) =>
        page.items.map((item) =>
          item.kind === 'media' ? { kind: 'media', id: item.id, item: toMediaItem(item) } : item
        )
      ),
    [query.data]
  );

  const refresh = useCallback(
    () => void queryClient.invalidateQueries({ queryKey: MEDIATHEK_QUERY_KEY }),
    [queryClient]
  );

  /** Moves the entry to the Papierkorb; true when that worked. */
  const remove = useCallback(
    async (entry: MediathekEntry): Promise<boolean> => {
      try {
        if (entry.kind === 'media') {
          if (!(await mediaApi.deleteMedia(entry.id)).success) return false;
        } else if (entry.kind === 'canvas') {
          const res = await getContractsClient().canvas.remove({ params: { id: entry.id } });
          if (res.status !== 200) return false;
          void queryClient.invalidateQueries({ queryKey: ['canvas', 'list'] });
        } else {
          await apiClient.delete(entry.deleteEndpoint.replace(/^\/api/, ''));
        }
      } catch (err) {
        console.warn('[useMediathek] delete failed', err);
        return false;
      }
      refresh();
      return true;
    },
    [queryClient, refresh]
  );

  const update = useCallback(
    async (id: string, updates: MediaUpdateParams): Promise<boolean> => {
      const ok = (await mediaApi.updateMedia(id, updates)).success;
      if (ok) refresh();
      return ok;
    },
    [refresh]
  );

  const lastPage = query.data?.pages.at(-1);
  return {
    entries,
    total: lastPage?.total ?? 0,
    hasMore: query.hasNextPage,
    isLoading: query.isLoading,
    isFetchingNextPage: query.isFetchingNextPage,
    error: query.error ? 'Die Mediathek konnte nicht geladen werden.' : null,
    loadMore: () => void query.fetchNextPage(),
    remove,
    update,
  };
}
