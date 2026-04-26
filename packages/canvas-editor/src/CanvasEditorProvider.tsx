import { createContext, useContext, useEffect } from 'react';

import { setIconifyApiUrl } from './utils/canvasIcons';

import type { UseGenerateCanvasSuggestions } from './common/canvasAiTypes';
import type { StockImage, StockImageAttribution } from './common/imageSourceTypes';
import type { ReactNode } from 'react';

/**
 * Information about the current canvas passed to the chat service when the
 * user opens the in-canvas chat. Used by the chat composer to insert sharepic
 * content via the "Sharepic einfügen" button.
 */
export interface ChatOpenContext {
  /** Template id (e.g. 'zitat', 'simple', 'dreizeilen'). */
  canvasType: string;
  /** Returns a structured German text description of the current canvas. */
  getSharepicText: () => string;
}

export interface CanvasEditorServices {
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

  /** Track Unsplash download (API compliance) */
  trackUnsplashDownload?: (image: StockImage) => Promise<void>;

  /** Track live Unsplash API download */
  trackUnsplashDownloadLive?: (downloadLocation: string) => Promise<void>;

  /** Fetch Unsplash image as File */
  fetchUnsplashImageAsFile?: (image: StockImage) => Promise<File>;

  /** Open Unsplash search in browser */
  openUnsplashSearch?: (query: string) => void;

  /** Social post generation hook factory */
  useGenerateSocialPost?: () => {
    generatedPosts: Record<string, unknown>;
    generatePost: (
      thema: string,
      details: string,
      platforms: string[],
      includeActionIdeas: boolean
    ) => Promise<Record<string, unknown>>;
    loading: boolean;
    error: unknown;
  };

  /** API base URL for multi-page export */
  apiBaseUrl?: string;

  /** Base URL for static assets (illustrations, etc.). Defaults to '' (same origin). */
  assetBaseUrl?: string;

  /** Self-hosted Iconify API URL for icon browsing/search (e.g., 'https://iconify.gruenerator.eu') */
  iconifyApiUrl?: string;

  /**
   * Optional AI-suggestions hook factory. When provided, templates that
   * register the `AiSection` will render the prompt UI; otherwise the
   * section shows a "not configured" hint and never calls a backend.
   */
  useGenerateCanvasSuggestions?: UseGenerateCanvasSuggestions;

  /**
   * Optional handler invoked when the user opens the Chat section. The host
   * app (apps/web) implements this by rendering a chat modal. When omitted,
   * the Chat section shows a "not configured" hint.
   */
  openChat?: (context: ChatOpenContext) => void;
}

const CanvasEditorContext = createContext<CanvasEditorServices>({});

export function CanvasEditorProvider({
  services,
  children,
}: {
  services: CanvasEditorServices;
  children: ReactNode;
}) {
  useEffect(() => {
    if (services.iconifyApiUrl) {
      setIconifyApiUrl(services.iconifyApiUrl);
    }
  }, [services.iconifyApiUrl]);

  return <CanvasEditorContext.Provider value={services}>{children}</CanvasEditorContext.Provider>;
}

export function useCanvasEditorServices(): CanvasEditorServices {
  return useContext(CanvasEditorContext);
}
