/**
 * What the editor needs from its host for data it does not own: the media
 * library, image shares, file delivery, Studio assets and the Unsplash search
 * state. Supplied through `CanvasEditorServices`; apps/web passes the
 * @gruenerator/shared implementations (`webCanvasEditorServices.ts`).
 *
 * The shapes are the structural subset the editor reads, so a host can hand in
 * its own hooks unchanged. The hook-valued services are React hooks: the
 * editor calls them unconditionally once per render, so a host must not swap
 * them in or out while an editor is mounted (a `useMemo`'d services object, as
 * `WebCanvasEditorProvider` builds, never does).
 *
 * Each `use…` helper below returns the host's implementation or the fallback
 * the editor runs on without it: an empty list, an upload that yields nothing,
 * no autosave, a plain browser download.
 */

import { useState, type ComponentType } from 'react';

import type {
  MediaItem,
  MediaType,
  StockImage,
  StudioAssetItem,
  StudioAssetKind,
  StudioAssetScope,
  UnsplashSearchResult,
  UploadSource,
} from '@gruenerator/contracts';

// ── Media library ───────────────────────────────────────────────────────────

export interface CanvasMediaLibraryState {
  items: MediaItem[];
  isLoading: boolean;
  error: string | null;
  pagination: { hasMore: boolean };
  setFilters: (filters: { search: string }) => void;
  deleteItem: (id: string) => Promise<unknown>;
  loadMore: () => Promise<void>;
}

export interface CanvasMediaUploadResult {
  id: string;
  shareToken: string;
  mediaType: MediaType;
  createdAt: string;
}

export interface CanvasMediaUploadState {
  upload: (
    file: File,
    options: { uploadSource: UploadSource }
  ) => Promise<CanvasMediaUploadResult | null>;
  isUploading: boolean;
  progress: number;
  error: string | null;
}

export interface CanvasMediaThumbProps {
  item: MediaItem;
  alt: string;
  sizes?: string;
}

export interface CanvasMediaLibraryService {
  /** Hook: the viewer's images, newest first. */
  useMediaLibrary: (options: {
    initialFilters: { type: 'image'; sort: 'newest' };
  }) => CanvasMediaLibraryState;
  /** Hook: uploads into the library. */
  useMediaUpload: () => CanvasMediaUploadState;
  /** The responsive image of a library item. */
  MediaThumb: ComponentType<CanvasMediaThumbProps>;
}

const NO_ITEMS: MediaItem[] = [];
const NO_LIBRARY: CanvasMediaLibraryState = {
  items: NO_ITEMS,
  isLoading: false,
  error: null,
  pagination: { hasMore: false },
  setFilters: () => {},
  deleteItem: () => Promise.resolve(),
  loadMore: () => Promise.resolve(),
};
const NO_UPLOAD: CanvasMediaUploadState = {
  upload: () => Promise.resolve(null),
  isUploading: false,
  progress: 0,
  error: null,
};

const useNoMediaLibrary: CanvasMediaLibraryService['useMediaLibrary'] = () => NO_LIBRARY;
const useNoMediaUpload: CanvasMediaLibraryService['useMediaUpload'] = () => NO_UPLOAD;
/** Never rendered in practice: without a library there are no items to show. */
const NoMediaThumb: ComponentType<CanvasMediaThumbProps> = () => null;

export function mediaLibraryOrFallback(
  service: CanvasMediaLibraryService | undefined
): CanvasMediaLibraryService {
  return (
    service ?? {
      useMediaLibrary: useNoMediaLibrary,
      useMediaUpload: useNoMediaUpload,
      MediaThumb: NoMediaThumb,
    }
  );
}

// ── Image shares (autosave, publish) ────────────────────────────────────────

export interface CanvasCreateImageShareParams {
  imageData: string;
  title?: string;
  imageType?: string;
  contentOrigin?: 'ki' | 'sharepic';
  metadata?: Record<string, unknown>;
  originalImage?: string;
  status?: 'draft';
}

export interface CanvasUpdateImageShareParams {
  shareToken: string;
  imageBase64: string;
  title?: string;
  metadata?: Record<string, unknown>;
  originalImage?: string;
}

export interface CanvasImageShareService {
  createImageShare: (params: CanvasCreateImageShareParams) => Promise<{ shareToken: string }>;
  updateImageShare: (params: CanvasUpdateImageShareParams) => Promise<{ shareToken: string }>;
  /** Promotes an autosaved draft before the user shares it. */
  publishShare: (shareToken: string) => Promise<unknown>;
}

// ── File delivery (download, share sheet) ───────────────────────────────────

export type CanvasShareRoute = 'web-share' | 'native-host' | null;

export interface CanvasFileDeliveryService {
  downloadDataUrl: (dataUrl: string, filename: string) => void | Promise<void>;
  downloadBlob: (blob: Blob, filename: string) => Promise<void>;
  /** How this page can open a share sheet, or `null` when it cannot. */
  pickShareRoute: () => CanvasShareRoute;
  /** Only called when `pickShareRoute()` answered `'native-host'`. */
  shareDataUrlViaNativeHost: (
    dataUrl: string,
    filename: string,
    options?: { title?: string; text?: string }
  ) => void;
}

function clickAnchor(href: string, filename: string): void {
  const a = document.createElement('a');
  a.href = href;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/** A plain browser: anchor downloads and the Web Share API, no native host. */
export const browserFileDelivery: CanvasFileDeliveryService = {
  downloadDataUrl: (dataUrl, filename) => clickAnchor(dataUrl, filename),
  downloadBlob: (blob, filename) => {
    const url = URL.createObjectURL(blob);
    clickAnchor(url, filename);
    // Revoked later: a download manager may read the URL after the click.
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    return Promise.resolve();
  },
  pickShareRoute: () =>
    typeof navigator !== 'undefined' && 'share' in navigator ? 'web-share' : null,
  shareDataUrlViaNativeHost: () => {
    throw new Error('Kein nativer Host zum Teilen vorhanden.');
  },
};

// ── Studio assets (sticker and background galleries) ────────────────────────

export interface CanvasStudioAssetsFilter {
  kind: StudioAssetKind;
  scope: StudioAssetScope;
  q: string;
  sort: 'new';
}

export interface CanvasStudioAssetsState {
  items: StudioAssetItem[];
  isLoading: boolean;
  isError: boolean;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  fetchNextPage: () => Promise<unknown>;
  refetch: () => Promise<unknown>;
}

/** Hook: one page-wise list of Studio assets. */
export type UseCanvasStudioAssets = (filter: CanvasStudioAssetsFilter) => CanvasStudioAssetsState;

const NO_ASSETS: CanvasStudioAssetsState = {
  items: [],
  isLoading: false,
  isError: false,
  hasNextPage: false,
  isFetchingNextPage: false,
  fetchNextPage: () => Promise.resolve(),
  refetch: () => Promise.resolve(),
};

export const useNoStudioAssets: UseCanvasStudioAssets = () => NO_ASSETS;

// ── Unsplash search state ───────────────────────────────────────────────────

export type UnsplashSearchFn = (
  query: string,
  page: number,
  perPage: number
) => Promise<UnsplashSearchResult>;

export interface CanvasUnsplashSearchState {
  searchResults: StockImage[];
  totalResults: number;
  isLoadingSearch: boolean;
  searchError: string | null;
  /** Set when the shared hourly Unsplash quota is used up. */
  limit: { retryAt: Date } | null;
  /** Searches left this hour, as last reported by Unsplash. */
  remaining: number | null;
  lastQuery: string;
  searchUnsplash: (query: string) => Promise<void>;
  loadMoreResults: () => Promise<void>;
}

/**
 * Hook: search state over `searchFn`. Host-supplied because the quota notice
 * depends on the error class the host's search function throws.
 */
export type UseCanvasUnsplashSearch = (searchFn: UnsplashSearchFn) => CanvasUnsplashSearchState;

/** Without a host: the query is remembered, results stay empty. */
export const useNoUnsplashSearch: UseCanvasUnsplashSearch = () => {
  const [lastQuery, setLastQuery] = useState('');
  return {
    searchResults: [],
    totalResults: 0,
    isLoadingSearch: false,
    searchError: null,
    limit: null,
    remaining: null,
    lastQuery,
    searchUnsplash: (query) => {
      setLastQuery(query.trim() ? query : '');
      return Promise.resolve();
    },
    loadMoreResults: () => Promise.resolve(),
  };
};
