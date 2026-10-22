import { type StudioAssetItem, type StudioAssetListResponse } from '@gruenerator/contracts';
import { type InfiniteData } from '@tanstack/react-query';

export type StudioAssetPages = InfiniteData<StudioAssetListResponse, number>;

/** Applies `patch` to the item with `id` on every cached page; other items keep their identity. */
export function patchStudioAssetPages(
  data: StudioAssetPages,
  id: string,
  patch: (item: StudioAssetItem) => StudioAssetItem
): StudioAssetPages {
  return {
    ...data,
    pages: data.pages.map((page) =>
      page.items.some((item) => item.id === id)
        ? { ...page, items: page.items.map((item) => (item.id === id ? patch(item) : item)) }
        : page
    ),
  };
}

export function removeStudioAssetFromPages(data: StudioAssetPages, id: string): StudioAssetPages {
  return {
    ...data,
    pages: data.pages.map((page) => ({
      ...page,
      items: page.items.filter((item) => item.id !== id),
    })),
  };
}

/** Flips `liked` and moves the count with it — for any item that carries both (studio assets, Marktplatz items). */
export const toggledLike = <T extends { liked: boolean; likesCount: number }>(item: T): T => ({
  ...item,
  liked: !item.liked,
  likesCount: Math.max(0, item.likesCount + (item.liked ? -1 : 1)),
});
