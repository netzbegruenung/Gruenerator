import { isShareSrc } from '@gruenerator/contracts';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { ElementItem } from './elementTypes';

export const RECENT_ELEMENTS_LIMIT = 12;

/** F0: persisted in every browser that opened the editor. */
const STORAGE_KEY = 'gruenerator-canvas-recent-elements';

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

const STOCK_PREFIX = '/api/image-picker/stock-image/';

/**
 * Storage is outside our control: a URL that reaches the canvas must be one the
 * catalogue could have produced, as when a gallery sticker loads from a document.
 */
function hasTrustedSource(item: ElementItem): boolean {
  const action = item.action;
  if (action.kind === 'sticker') return isShareSrc(action.ref.src);
  if (action.kind === 'media') return action.url.startsWith(STOCK_PREFIX);
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
      name: STORAGE_KEY,
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
