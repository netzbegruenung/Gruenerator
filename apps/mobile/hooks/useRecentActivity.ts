import { getGlobalApiClient } from '@gruenerator/shared/api';
import { useQuery } from '@tanstack/react-query';
import { useRouter, type Href } from 'expo-router';
import { useCallback } from 'react';
import { Linking } from 'react-native';

import { DEV_FIXTURES_ENABLED, DEV_RECENT_ACTIVITY } from '../services/devFixtures';

const WEB_ORIGIN = 'https://gruenerator.eu';

export type RecentItemType = 'doc' | 'board' | 'image' | 'video' | 'presentation' | 'canvas';

export interface RecentItem {
  id: string;
  title: string;
  date: string;
  type: RecentItemType;
  href: string;
  thumbnailUrl?: string;
  content?: string;
  documentType?: string;
  creatorName?: string;
  accessType?: string;
}

const fetchRecentActivity = async (): Promise<RecentItem[]> => {
  if (DEV_FIXTURES_ENABLED) return DEV_RECENT_ACTIVITY;
  const res = await getGlobalApiClient().get<{ items?: RecentItem[] }>('/recent-activity', {
    params: { limit: 12 },
  });
  return res.data?.items ?? [];
};

/**
 * The `/recent-activity` feed — docs, boards, images, reels and canvases in one
 * list. Shared by the start page's "Zuletzt" strip and the Studio tab's media
 * sections; one query key means the second consumer reads the first one's cache
 * instead of refetching.
 */
export function useRecentActivity(): { items: RecentItem[]; isLoading: boolean } {
  const { data = [], isLoading } = useQuery({
    queryKey: ['recent-activity'],
    queryFn: fetchRecentActivity,
    staleTime: 30_000,
  });
  return { items: data, isLoading };
}

/**
 * Opens a recent item where mobile can actually render it: docs in the native
 * editor, image shares in the in-app viewer (which downloads, previews and offers
 * save/share). Everything else has no native surface yet and opens on the web.
 */
export function useOpenRecentItem(): (item: RecentItem) => void {
  const router = useRouter();

  return useCallback(
    (item: RecentItem) => {
      if (item.type === 'doc') {
        router.push({ pathname: '/(fullscreen)/doc-editor', params: { id: item.id } } as Href);
        return;
      }
      // `item.id` is the share_token for image shares.
      if (item.type === 'image') {
        router.push({
          pathname: '/(fullscreen)/pushed-content',
          params: { shareToken: item.id, mediaType: 'image', title: item.title },
        } as Href);
        return;
      }
      void Linking.openURL(`${WEB_ORIGIN}${item.href}`);
    },
    [router]
  );
}
