import { MEDIA_LIBRARY_QUERY_KEY } from '@gruenerator/shared/media-library';
import {
  SharedMediaPicture,
  type SharedMediaPictureProps,
  type SharedMediaUrlOptions,
} from '@gruenerator/shared/media-library/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';

import { RECENT_ACTIVITY_KEY } from '../../features/workplace/hooks/useRecentActivity';
import { resolveApiAssetUrl } from '../../utils/platform';

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '/api';

// Tokens already reported gone, so one dead tile triggers one refetch and no
// more. Without this a list that kept returning the row — a server bug, but a
// cheap one to guard against — would refetch on every render of the same tile.
const reportedGone = new Set<string>();

// Both lists are built from `shared_media` rows, so a 410 on one of their
// previews means the cached list is stale by definition. Deliberately not
// `['canvas', 'list']`: a canvas is its own row and can outlive the share whose
// preview it borrows, so refetching it would not make the tile go away.
const SHARED_MEDIA_LIST_KEYS = [RECENT_ACTIVITY_KEY, MEDIA_LIBRARY_QUERY_KEY] as const;

/**
 * The web app's URL options for shared media: the configured API base, the
 * desktop origin prefix, and a one-time list refetch when a preview is gone.
 * Pass to any `@gruenerator/shared/media-library/ui` component.
 */
export function useSharedMediaUrlOptions(shareToken?: string): SharedMediaUrlOptions {
  const queryClient = useQueryClient();

  // The image degrades to its blurhash on its own; what it cannot do is remove
  // the tile around it. Refetching the lists that are built from `shared_media`
  // does, and the server is the only thing that knows what is really left.
  const onGone = useCallback(() => {
    if (!shareToken || reportedGone.has(shareToken)) return;
    reportedGone.add(shareToken);
    for (const queryKey of SHARED_MEDIA_LIST_KEYS) {
      void queryClient.invalidateQueries({ queryKey });
    }
  }, [queryClient, shareToken]);

  return useMemo(
    () => ({ baseUrl: API_BASE_URL, resolveUrl: resolveApiAssetUrl, onGone }),
    [onGone]
  );
}

export type SharedMediaImageProps = Omit<SharedMediaPictureProps, keyof SharedMediaUrlOptions>;

/**
 * The single app-wide standard for rendering a shared-media preview image:
 * responsive AVIF/WebP variants, BlurHash placeholder, lazy/priority loading.
 * Use this everywhere a `/share/.../preview` image is shown instead of a
 * bespoke `<img>`.
 */
export function SharedMediaImage(props: SharedMediaImageProps) {
  const urlOptions = useSharedMediaUrlOptions(props.shareToken);
  return <SharedMediaPicture {...props} {...urlOptions} />;
}
