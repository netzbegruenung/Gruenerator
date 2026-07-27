import { fetchProjects } from '@gruenerator/shared';
import { getUserShares } from '@gruenerator/shared/share';
import { useQueries, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';

import {
  DEV_CANVASES,
  DEV_FIXTURES_ENABLED,
  DEV_REEL_PROJECTS,
  DEV_SHARES,
} from '../services/devFixtures';
import { officeApi } from '../services/office/officeApi';

import { toKiImageItems, toReelItems, toSharepicItems } from './studioMediaMapping';
import { type RecentItem } from './useRecentActivity';

const SHAREPICS_KEY = ['studio', 'shares', 'image'] as const;
const CANVASES_KEY = ['studio', 'canvases'] as const;
const REELS_KEY = ['studio', 'reels'] as const;

export interface StudioMedia {
  /** Published image shares that are not KI output, plus editable canvases. */
  sharepics: RecentItem[];
  kiImages: RecentItem[];
  reels: RecentItem[];
  isLoading: boolean;
  /** At least one source failed. Says nothing about the other two. */
  isError: boolean;
  refetch: () => void;
}

/**
 * The Studio tab's media, from the endpoints that actually list it.
 *
 * Explicitly not `/recent-activity`. That feed takes `limit` rows from each of
 * five content kinds, sorts them together and then truncates the merged list to
 * `limit` again — so a dozen recently touched documents push every sharepic, KI
 * image and reel out of the response, and the tab renders empty for an account
 * full of media. Web hit the same wall and answered it the same way: it reads
 * `/share/recent` and `/canvas` directly and keeps the merged feed for reels only.
 *
 * Three independent queries, so one failing source cannot blank the other two,
 * and `isError` is reported next to the data rather than swallowed. Before this
 * the screen could not tell "nothing created yet" from "the request failed" and
 * offered onboarding for both.
 */
export function useStudioMedia(): StudioMedia {
  const queryClient = useQueryClient();

  const [shares, canvases, reels] = useQueries({
    queries: [
      {
        queryKey: SHAREPICS_KEY,
        // The dev bypass authenticates client-side, so every list endpoint
        // answers 401 — without fixtures this screen would show nothing but its
        // error state under the very flag that exists to lay it out.
        queryFn: async () =>
          DEV_FIXTURES_ENABLED ? DEV_SHARES : (await getUserShares('image')).shares,
        staleTime: 30_000,
      },
      {
        queryKey: CANVASES_KEY,
        queryFn: () => (DEV_FIXTURES_ENABLED ? DEV_CANVASES : officeApi.fetchCanvases()),
        staleTime: 30_000,
      },
      {
        queryKey: REELS_KEY,
        queryFn: () => (DEV_FIXTURES_ENABLED ? DEV_REEL_PROJECTS : fetchProjects()),
        staleTime: 30_000,
      },
    ],
  });

  const sharepics = useMemo(
    () => toSharepicItems(shares.data ?? [], canvases.data ?? []),
    [shares.data, canvases.data]
  );
  const kiImages = useMemo(() => toKiImageItems(shares.data ?? []), [shares.data]);
  const reelItems = useMemo(() => toReelItems(reels.data ?? []), [reels.data]);

  const refetch = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['studio'] });
  }, [queryClient]);

  return {
    sharepics,
    kiImages,
    reels: reelItems,
    isLoading: shares.isLoading || canvases.isLoading || reels.isLoading,
    isError: shares.isError || canvases.isError || reels.isError,
    refetch,
  };
}
