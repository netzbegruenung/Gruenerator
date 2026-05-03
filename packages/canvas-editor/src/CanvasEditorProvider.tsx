import { createContext, useContext, useEffect } from 'react';

import { setIconifyApiUrl } from './utils/canvasIcons';

import type { ApplyResult } from './ai/applyOperation';
import type { UseGenerateCanvasSuggestions } from './common/canvasAiTypes';
import type { StockImage, StockImageAttribution } from './common/imageSourceTypes';
import type {
  CanvasAiCapabilities,
  CanvasAiOperation,
  CanvasAiSnapshot,
} from '@gruenerator/contracts';
import type { ComponentType, ReactNode } from 'react';

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
  getSnapshot: () => CanvasAiSnapshot;
  /** Applies an array of operations and returns one ApplyResult per op. */
  applyOperations: (ops: CanvasAiOperation[]) => ApplyResult[];
}

/**
 * Props passed to the host-supplied chat component when the user opens the
 * Chat sidebar tab. The component renders inline inside the sidebar panel.
 */
export interface ChatSectionContentProps {
  /** Template id (e.g. 'zitat', 'simple', 'dreizeilen'). */
  canvasType: string;
  /** Returns a structured German text description of the current canvas. */
  getSharepicText: () => string;
  /** Captures the current canvas as a PNG data URL (or null if not ready). */
  captureCanvasImage?: () => Promise<string | null>;
  /** Optional bridge to canvas-AI edit operations. Present only when the
   *  template declares AI capabilities. */
  aiEdit?: CanvasAiEditBridge;
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

  /**
   * Generate a background image from a text prompt via the host's AI image
   * pipeline. The host is expected to wrap an authenticated endpoint that
   * enforces per-user quota; the returned `remaining` is surfaced in the UI.
   * When omitted, the AI subsection is hidden.
   */
  generateAiBackgroundImage?: (
    prompt: string,
    opts: {
      variant: 'illustration' | 'realistic' | 'pixel';
      width?: number;
      height?: number;
    }
  ) => Promise<{ file: File; remaining: number | null }>;

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
   * Optional component rendered inside the Chat sidebar section. The host
   * app (apps/web) supplies the actual chat UI here. When omitted, the Chat
   * section shows a "not configured" hint.
   */
  ChatSectionContent?: ComponentType<ChatSectionContentProps>;
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
