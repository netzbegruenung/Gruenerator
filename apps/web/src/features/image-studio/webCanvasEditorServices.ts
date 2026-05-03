import { useGenerateSocialPost } from '../../components/hooks/useGenerateSocialPost';

import {
  fetchStockImages,
  fetchStockImageAsFile,
  searchUnsplashImages,
  trackUnsplashDownload,
  trackUnsplashDownloadLive,
  fetchUnsplashImageAsFile,
  openUnsplashSearch,
  generateAiBackgroundImage,
} from './services/imageSourceService';
import { useGenerateCanvasSuggestions } from './useGenerateCanvasSuggestions';

import type { CanvasEditorServices } from '@gruenerator/canvas-editor';

export const webCanvasEditorServices: CanvasEditorServices = {
  fetchStockImages,
  fetchStockImageAsFile,
  searchUnsplashImages,
  trackUnsplashDownload,
  trackUnsplashDownloadLive,
  fetchUnsplashImageAsFile,
  openUnsplashSearch,
  generateAiBackgroundImage,
  useGenerateSocialPost,
  useGenerateCanvasSuggestions,
  apiBaseUrl: (import.meta.env.VITE_API_URL as string | undefined) ?? '',
  iconifyApiUrl: (import.meta.env.VITE_ICONIFY_API_URL as string | undefined) ?? '',
};
