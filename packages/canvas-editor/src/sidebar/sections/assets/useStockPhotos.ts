import { STOCK_CATEGORY_LABELS } from '@gruenerator/shared/image-studio';
import { useQuery, type QueryClient } from '@tanstack/react-query';

import { useCanvasEditorServices } from '../../../CanvasEditorProvider';

import type { ElementItem } from './elementTypes';
import type { StockImage, StockImageAttribution } from '../../../common/imageSourceTypes';

const STOCK_PHOTOS_QUERY_KEY = ['canvas', 'stock-photos'] as const;

/**
 * German names for the catalogue's `category`, so "Mobilität" finds the whole
 * group. Single words only: a word list per category made every photo in it
 * match "Wind" or "Fahrrad"; the search's own German→English dictionary reaches
 * the English tags and alt text of the right photos instead.
 */
const CATEGORY_NAMES: Record<string, string> = {
  agriculture: 'Landwirtschaft',
  economy: 'Wirtschaft',
  health: 'Gesundheit',
  housing: 'Wohnen',
  media: 'Medien',
  urban: 'Stadt',
};

function categoryName(category: string | undefined): string | null {
  if (!category) return null;
  return STOCK_CATEGORY_LABELS[category] ?? CATEGORY_NAMES[category] ?? null;
}

/** Only a real Unsplash credit travels with the image; the "Unknown" stub does not. */
function creditOf(image: StockImage): StockImageAttribution | null {
  const a = image.attribution;
  return a && a.profileUrl && a.photoUrl ? a : null;
}

export function stockPhotoItem(image: StockImage): ElementItem {
  const url = `/api/image-picker/stock-image/${encodeURIComponent(image.filename)}`;
  const category = categoryName(image.category);
  const credit = creditOf(image);
  const tags = Array.isArray(image.tags)
    ? (image.tags as unknown[]).filter((t) => typeof t === 'string')
    : [];
  return {
    key: `photo:${image.filename}`,
    // Named like a live Unsplash hit: the photographer is the credit, a category says nothing.
    label: credit ? credit.photographer : 'Foto',
    keywords: [
      'Foto',
      ...(category ? [category] : []),
      ...(credit ? [credit.photographer] : []),
      ...(tags as string[]),
      image.alt_text ?? '',
    ],
    action: {
      kind: 'media',
      url,
      name: image.alt_text ?? image.filename,
      ...(credit ? { attribution: credit } : {}),
    },
    thumb: { t: 'photo', src: url },
  };
}

/** Unsplash serves resized copies of the same hotlinked URL via imgix's `w`. */
export function unsplashThumbnailUrl(url: string): string {
  try {
    const u = new URL(url);
    u.searchParams.set('w', '400');
    return u.toString();
  } catch {
    return url;
  }
}

/**
 * A live Unsplash search hit as a tile. It is placed by its hotlinked URL —
 * API Terms §6 forbid re-hosting the unaltered photo — and labelled with the
 * photographer, which is the credit Unsplash requires next to the photo.
 */
export function unsplashPhotoItem(image: StockImage): ElementItem {
  const credit = creditOf(image);
  return {
    key: `unsplash:${image.filename}`,
    label: credit ? credit.photographer : 'Unsplash',
    keywords: [],
    action: {
      kind: 'media',
      url: image.url ?? '',
      name: image.alt_text ?? image.filename,
      ...(credit ? { attribution: credit } : {}),
    },
    thumb: { t: 'photo', src: unsplashThumbnailUrl(image.url ?? '') },
  };
}

type FetchStockImages = NonNullable<ReturnType<typeof useCanvasEditorServices>['fetchStockImages']>;

function stockPhotosQuery(fetchStockImages: FetchStockImages) {
  return {
    queryKey: STOCK_PHOTOS_QUERY_KEY,
    queryFn: async () => (await fetchStockImages(null)).images.map(stockPhotoItem),
    staleTime: Infinity,
    gcTime: Infinity,
  };
}

/** The bundled stock photos as tiles; empty where the host offers no catalogue. */
export function useStockPhotos(enabled: boolean) {
  const { fetchStockImages } = useCanvasEditorServices();
  const query = useQuery({
    ...stockPhotosQuery(fetchStockImages ?? (() => Promise.reject(new Error('no catalogue')))),
    enabled: enabled && fetchStockImages !== undefined,
  });
  return { items: query.data ?? [], isLoading: query.isLoading };
}

/** Warm the catalogue before the tab opens, so the Fotos card has its cover. */
export function prefetchStockPhotos(client: QueryClient, fetchStockImages: FetchStockImages) {
  return client.prefetchQuery(stockPhotosQuery(fetchStockImages));
}
