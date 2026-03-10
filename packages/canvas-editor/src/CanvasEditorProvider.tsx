import { createContext, useContext } from 'react';

import type { ReactNode } from 'react';

import type { StockImage, StockImageAttribution } from './common/imageSourceTypes';

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
}

const CanvasEditorContext = createContext<CanvasEditorServices>({});

export function CanvasEditorProvider({
  services,
  children,
}: {
  services: CanvasEditorServices;
  children: ReactNode;
}) {
  return <CanvasEditorContext.Provider value={services}>{children}</CanvasEditorContext.Provider>;
}

export function useCanvasEditorServices(): CanvasEditorServices {
  return useContext(CanvasEditorContext);
}
