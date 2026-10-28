// SPDX-License-Identifier: MPL-2.0
import { useQuery } from '@tanstack/react-query';

import { loadEmojiCatalog, type EmojiCatalogGroup } from '../utils/emoji/emojiCatalog.js';

/** The full emoji catalogue, loaded once someone browses or searches emoji. */
export function useEmojiCatalog(enabled: boolean) {
  return useQuery<EmojiCatalogGroup[]>({
    queryKey: ['canvas', 'emoji', 'catalog'],
    queryFn: loadEmojiCatalog,
    enabled,
    staleTime: Infinity,
    gcTime: Infinity,
  });
}
