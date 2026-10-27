// SPDX-License-Identifier: MPL-2.0
import { createContext, useContext } from 'react';

import type {
  CanvasCarouselService,
  CanvasFileDeliveryService,
  CanvasImageShareService,
  CanvasImageUrlService,
  CanvasMediaLibraryService,
  CanvasPrintService,
  UseCanvasStudioAssets,
  UseCanvasUnsplashSearch,
} from './hostServices';
import type {
  ApplyResult,
  HostCanvasAiOperation,
  HostCanvasAiSnapshot,
} from '@ggraphic/editor/ai/types';
import type { StockImage, StockImageAttribution } from '@ggraphic/editor/common/imageSourceTypes';
import type { AltTextPage, CanvasSpecEditBridge } from '@ggraphic/editor/editorSeamTypes';
import type { CanvasAiCapabilities } from '@ggraphic/schema';
import type { ComponentType, PropsWithChildren } from 'react';

/**
 * Bridge between the canvas-editor's typed state/actions/capabilities and the
 * host app's chat UI. Built inside `createChatSection` as a closure so the
 * host never sees the generic TState/TActions and can render suggestion cards
 * without depending on each template's internal types.
 */
export interface CanvasAiEditBridge {
  /** Capability list to send with the suggest request. */
  capabilityList: CanvasAiCapabilities;
  /** Builds a fresh CanvasAiSnapshot at request-time. */
  getSnapshot: () => HostCanvasAiSnapshot;
  /** Applies an array of operations and returns one ApplyResult per op. */
  applyOperations: (ops: HostCanvasAiOperation[]) => ApplyResult[];
}

export type {
  AltTextPage,
  AltTextScope,
  CanvasSpecEditBridge,
} from '@ggraphic/editor/editorSeamTypes';

/**
 * Props passed to the host-supplied chat component when the user opens the
 * Chat sidebar tab. The component renders inline inside the sidebar panel.
 */
export interface ChatSectionContentProps {
  /** Template id (e.g. 'zitat', 'simple'). */
  canvasType: string;
  /** Returns a structured German text description of the current canvas. */
  getSharepicText: () => string;
  /** Captures the current canvas as a PNG data URL (or null if not ready). */
  captureCanvasImage?: () => Promise<string | null>;
  /** Optional bridge to canvas-AI edit operations. Present only when the
   *  template declares AI capabilities. */
  aiEdit?: CanvasAiEditBridge;
  /** Present in the multi-page editor once its pages doc is synced. */
  specEdit?: CanvasSpecEditBridge;
}

/**
 * Services only a host's own UI reads. Empty here: a host declares its members
 * by augmenting this interface (`declare module`), and `CanvasEditorServices`
 * carries them.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- filled by host augmentation
export interface CanvasEditorHostServices {}

export interface CanvasEditorServices extends CanvasEditorHostServices {
  /** Fetch curated stock images by category */
  fetchStockImages?: (category?: string | null) => Promise<{
    success: boolean;
    images: StockImage[];
    categories: string[];
  }>;

  /** Fetch a stock image as a File object */
  fetchStockImageAsFile?: (image: StockImage) => Promise<File>;

  /** Search Unsplash images via backend proxy */
  searchUnsplashImages?: (
    query: string,
    page?: number,
    perPage?: number
  ) => Promise<{ results: StockImage[]; total: number; total_pages: number }>;

  /**
   * The `utm_source` of links to Unsplash (API Terms: name the app). Defaults
   * to `ggraphic`.
   */
  unsplashUtmSource?: string;

  /** Track Unsplash download (API compliance) */
  trackUnsplashDownload?: (image: StockImage) => Promise<void>;

  /** Track live Unsplash API download */
  trackUnsplashDownloadLive?: (downloadLocation: string) => Promise<void>;

  /** Fetch Unsplash image as File */
  fetchUnsplashImageAsFile?: (image: StockImage) => Promise<File>;

  /**
   * Upload an image blob to the host's media library and return a durable URL.
   * In-editor image pickers call this so the persisted background is a stable
   * URL that survives reloads/collaborators — never a session-local `blob:` URL.
   * When omitted, pickers fall back to the (non-durable) object URL.
   */
  uploadImage?: (file: Blob, opts?: { filename?: string }) => Promise<string | null>;

  /** Open Unsplash search in browser */
  openUnsplashSearch?: (query: string) => void;

  /** Open the host's sticker creator. When omitted, the Sticker card offers no "Sticker erstellen". */
  openStickerCreator?: () => void;

  /**
   * Generate an image from a text prompt via the host's AI image pipeline.
   * The host is expected to wrap an authenticated endpoint that enforces
   * per-user quota; the returned `remaining` is surfaced in the UI. When
   * omitted, the AI-create tool is hidden.
   */
  generateAiImage?: (
    prompt: string,
    opts: {
      variant: 'illustration' | 'realistic' | 'pixel';
      width?: number;
      height?: number;
    }
  ) => Promise<{ file: File; remaining: number | null }>;

  /**
   * Remove the background of an image via the host's server-side
   * background-removal pipeline. When omitted, the bg-removal tool is hidden.
   */
  removeBackgroundFromImage?: (
    file: File | Blob,
    onProgress?: (p: { phase: string; progress: number; message: string }) => void
  ) => Promise<{ file: File; objectUrl: string }>;

  /**
   * Edit an image with a natural-language instruction via Flux. The host
   * wraps the authenticated endpoint and rate-limit checks. When omitted,
   * the AI-edit tool is hidden.
   */
  editAiImage?: (image: File, instruction: string) => Promise<{ file: File; objectUrl: string }>;

  /**
   * „Erweitern" in the crop mode: AI-outpaints `image` to the aspect ratio
   * `aspect` (width / height) of its frame. Reject with an `Error` carrying
   * `userFacing: true` to have its message shown as the toast
   * (consent, budget); any other error shows the editor's generic text. When omitted, the button is hidden.
   */
  expandImage?: (image: File, aspect: number) => Promise<File>;

  /**
   * One alt text per page, in the given order; `null` where a page failed.
   * When omitted, the alt-text tool is hidden.
   */
  generateSlideAltTexts?: (
    pages: ReadonlyArray<Pick<AltTextPage, 'image' | 'texts'>>
  ) => Promise<Array<string | null>>;

  /** API base URL for multi-page export */
  apiBaseUrl?: string;

  /** Base URL for static assets (illustrations, etc.). Defaults to '' (same origin). */
  assetBaseUrl?: string;

  /**
   * Brand locale of the signed-in user. Locale-scoped assets (AT vs DE logos,
   * Balken) are filtered by this; defaults to 'de-DE' when omitted.
   */
  userLocale?: 'de-DE' | 'de-AT';

  /**
   * Optional component rendered inside the Chat sidebar section. The host
   * app (apps/web) supplies the actual chat UI here. When omitted, the Chat
   * section shows a "not configured" hint.
   */
  ChatSectionContent?: ComponentType<ChatSectionContentProps>;

  /**
   * The viewer's media library (Uploads tab, image pickers). When omitted, the
   * list is empty and an upload yields nothing. Hooks: see `hostServices.ts`.
   */
  mediaLibrary?: CanvasMediaLibraryService;

  /** Autosave and draft publishing. When omitted, the editor does not autosave. */
  imageShares?: CanvasImageShareService;

  /**
   * Where stored images are drawn and fetched from (`CanvasImageUrlService` in
   * `hostServices.ts`). When omitted, every image loads from the URL it has
   * (`plainImageUrls`).
   */
  imageUrls?: CanvasImageUrlService;

  /**
   * Hands exports to the user. When omitted, the editor uses a plain browser
   * download and the Web Share API (`browserFileDelivery`).
   */
  fileDelivery?: CanvasFileDeliveryService;

  /** Hook for the sticker and background galleries. When omitted, they stay empty. */
  useStudioAssets?: UseCanvasStudioAssets;

  /** Hook holding the Unsplash search state. When omitted, searches find nothing. */
  useUnsplashSearch?: UseCanvasUnsplashSearch;

  /**
   * The impressum gate (`CanvasPrintService` in `hostServices.ts`). When
   * omitted, no format carries an impressum; the PDF export still works.
   */
  print?: CanvasPrintService;

  /**
   * Keeps the carousel chrome true after page ops (`CanvasCarouselService`).
   * When omitted, page ops leave the chrome as it is.
   */
  carousel?: CanvasCarouselService;
}

const CanvasEditorContext = createContext<CanvasEditorServices>({});

export function CanvasEditorProvider({
  services,
  children,
}: PropsWithChildren<{ services: CanvasEditorServices }>) {
  return <CanvasEditorContext.Provider value={services}>{children}</CanvasEditorContext.Provider>;
}

export function useCanvasEditorServices(): CanvasEditorServices {
  return useContext(CanvasEditorContext);
}
