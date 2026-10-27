/**
 * What the editor needs from its host for data it does not own: the media
 * library, image shares, image URLs, file delivery, Studio assets, the
 * Unsplash search state, print (impressum, print Vorlagen), blocks and the
 * carousel chrome.
 * Supplied through `CanvasEditorServices`; the host passes its own
 * implementations, including those for print, blocks and the carousel chrome.
 *
 * The shapes are the structural subset the editor reads, so a host can hand in
 * its own hooks unchanged. The hook-valued services are React hooks: the
 * editor calls them unconditionally once per render, so a host must not swap
 * them in or out while an editor is mounted (a `useMemo`'d services object, as
 * `WebCanvasEditorProvider` builds, never does).
 *
 * Each `use…` helper below returns the host's implementation or the fallback
 * the editor runs on without it: an empty list, an upload that yields nothing,
 * no autosave, image URLs as they are, a plain browser download.
 */

import { useState, type ComponentType } from 'react';
import { type Doc } from 'yjs';

import type { BlockSlide, LiftedBlock } from './blocks/liftedBlock';
import type { AdditionalText } from './configs/types';
import type {
  MediaItem,
  MediaType,
  PrintFormatId,
  PrintSpec,
  SharepicColor,
  SharepicCreatorLocale,
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

// ── Image URLs (working-size variants, originals, placement) ────────────────

/**
 * Where the editor loads a stored image from. A host that keeps a smaller
 * variant of its images names it here; the editor draws that variant while an
 * element is narrow enough for it and the original once it is wider.
 */
export interface CanvasImageUrlService {
  /** Width of the host's variant in px; it is export-quality up to half of it. */
  previewWidth: number;
  /** The variant of a stored image, or the URL unchanged when there is none. */
  previewUrl: (url: string) => string;
  /** Where the original bytes of a stored image are fetched from. */
  originalUrl: (url: string) => string;
  /** The URL a media-library item is placed onto the canvas from. */
  placementUrl: (
    item: Pick<MediaItem, 'mediaUrl' | 'shareToken' | 'thumbnailUrl'>
  ) => string | null;
}

/** No host: every image is drawn and fetched from the URL it has. */
export const plainImageUrls: CanvasImageUrlService = {
  previewWidth: 0,
  previewUrl: (url) => url,
  originalUrl: (url) => url,
  placementUrl: (item) => item.mediaUrl || item.thumbnailUrl,
};

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

// ── Print (V.i.S.d.P. / Impressum, print Vorlagen) ──────────────────────────

/** The country form an impressum line is written in. */
export type CanvasImpressumLocale = 'de-DE' | 'de-AT';

export interface CanvasImpressumParts {
  /** Name (DE) or Medieninhaber (AT). */
  name: string;
  anschrift: string;
}

export interface CanvasImpressumLabels {
  name: string;
  namePlaceholder: string;
  hint: string;
}

/**
 * The legal line a printed poster carries, as one text element on the page.
 * The editor's export gate reads it back through these functions, so what
 * counts as filled in is decided by the host.
 */
export interface CanvasImpressumService {
  /** Id of the text element that carries the line on a page. */
  elementId: string;
  /** Which country form a page's line is written in. */
  localeOf: (page: { configId: string } | null) => CanvasImpressumLocale;
  line: (locale: CanvasImpressumLocale, parts: CanvasImpressumParts) => string;
  parse: (locale: CanvasImpressumLocale, text: string) => CanvasImpressumParts;
  /** A field counts once it is non-empty and not a placeholder. */
  isFilled: (value: string) => boolean;
  isComplete: (parts: CanvasImpressumParts) => boolean;
  labels: Record<CanvasImpressumLocale, CanvasImpressumLabels>;
  /** The element at its standard position on a page of `formatId`, for re-adding a deleted line. */
  composeElement: (formatId: PrintFormatId, isAt: boolean, text: string) => AdditionalText;
}

/**
 * What the editor needs for print beyond the PDF export itself: the
 * impressum gate and the composition of print Vorlagen.
 *
 * Without it the editor treats every format as one without an impressum —
 * no warning or form in the download view, no impressum carried over when a
 * Vorlage replaces the design — and the „Vorlagen" tab lists no print
 * Vorlagen. The PDF export is unaffected.
 */
export interface CanvasPrintService {
  impressum: CanvasImpressumService;
  /** The pages of a print Vorlage's spec (measures text: fonts must be ready). */
  composePrint: (spec: PrintSpec) => {
    templateType: string;
    slides: readonly Record<string, unknown>[];
  };
}

// ── Blocks (the host's blocks in the Elemente panel) ────────────────────────

/**
 * Turns a block the host composed (`CanvasVorlagenService.composeBlock`) into
 * items for a page. The editor places the result (`placeBlock`) and selects
 * its parts.
 *
 * Without it the editor offers no blocks: no „Blöcke" category in the
 * Elemente panel and no block drop onto a page, as without a block catalogue.
 */
export interface CanvasBlockService {
  /** The colour to compose a block on for a page with this background. */
  ground: (
    locale: SharepicCreatorLocale,
    page: { backgroundMode?: unknown; backgroundColor?: unknown },
    fallback: SharepicColor
  ) => SharepicColor;
  /** The elements of `items` cut loose from the composed slide, ids made unique by `token`. */
  lift: (slide: BlockSlide, items: readonly number[], token: string) => LiftedBlock;
}

// ── Carousel chrome (page number, swipe arrow) ──────────────────────────────

/**
 * Keeps a deck's chrome true after a structural page op (add, insert,
 * duplicate, remove, move, replace the deck).
 *
 * Without it page ops leave every page's state as it is: a composed page
 * number or swipe arrow stays what it was.
 */
export interface CanvasCarouselService {
  /** Rewrites the chrome of the pages document; called inside the page op's transaction. */
  refreshChrome: (doc: Doc) => void;
}
