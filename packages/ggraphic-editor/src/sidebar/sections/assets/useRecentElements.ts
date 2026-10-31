// SPDX-License-Identifier: MPL-2.0
import { getHostStorageKey, onHostStorageKeysChange } from '@ggraphic/editor/utils/hostStorageKeys';
import {
  onAssetCatalogChange,
  plainAssetImageUrls,
  registeredAssetCatalog,
} from '@ggraphic/editor/utils/canvasAssets';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { ElementItem } from './elementTypes.js';

export const RECENT_ELEMENTS_LIMIT = 12;

interface RecentElementsState {
  items: ElementItem[];
  remember: (item: ElementItem) => void;
}

/** A stored tile is only drawn again when it still has the shape this build expects. */
function isStoredItem(value: unknown): value is ElementItem {
  if (!value || typeof value !== 'object') return false;
  const v = value as Partial<ElementItem>;
  return (
    typeof v.key === 'string' &&
    typeof v.label === 'string' &&
    Array.isArray(v.keywords) &&
    typeof v.action === 'object' &&
    v.action !== null &&
    typeof (v.action as { kind?: unknown }).kind === 'string' &&
    typeof v.thumb === 'object' &&
    v.thumb !== null &&
    typeof (v.thumb as { t?: unknown }).t === 'string'
  );
}

/**
 * Storage is outside our control: a URL that reaches the canvas must be one the
 * catalogue could have produced, as when a gallery sticker loads from a document.
 */
function hasTrustedSource(item: ElementItem): boolean {
  const action = item.action;
  const catalog = registeredAssetCatalog();
  if (action.kind === 'sticker') return catalog.isInstanceSrc(action.ref.src);
  if (action.kind === 'media')
    return (catalog.imageUrls ?? plainAssetImageUrls).isStockPhoto(action.url);
  return true;
}

export function sanitizeRecentItems(value: unknown): ElementItem[] {
  return Array.isArray(value)
    ? value.filter(isStoredItem).filter(hasTrustedSource).slice(0, RECENT_ELEMENTS_LIMIT)
    : [];
}

export const useRecentElements = create<RecentElementsState>()(
  persist(
    (set) => ({
      items: [],
      remember: (item) =>
        set((state) => ({
          items: [item, ...state.items.filter((i) => i.key !== item.key)].slice(
            0,
            RECENT_ELEMENTS_LIMIT
          ),
        })),
    }),
    {
      name: getHostStorageKey('recentElements'),
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ items: state.items }),
      migrate: (persisted) => ({
        items: sanitizeRecentItems((persisted as { items?: unknown } | null)?.items),
      }),
      merge: (persisted, current) => ({
        ...current,
        items: sanitizeRecentItems((persisted as { items?: unknown } | null)?.items),
      }),
    }
  )
);

// A host registers its key at start-up, possibly after this module ran: follow it.
onHostStorageKeysChange(() => {
  const key = getHostStorageKey('recentElements');
  if (useRecentElements.persist.getOptions().name === key) return;
  useRecentElements.persist.setOptions({ name: key });
  void useRecentElements.persist.rehydrate();
});

// The trust check above reads the host's catalogue, which may register after this store hydrated.
onAssetCatalogChange(() => void useRecentElements.persist.rehydrate());
