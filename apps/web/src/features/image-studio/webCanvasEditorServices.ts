import { useGenerateSocialPost } from '../../components/hooks/useGenerateSocialPost';

import {
  fetchStockImages,
  fetchStockImageAsFile,
  searchUnsplashImages,
  trackUnsplashDownload,
  trackUnsplashDownloadLive,
  fetchUnsplashImageAsFile,
  openUnsplashSearch,
} from './services/imageSourceService';

import type { CanvasEditorServices } from '@gruenerator/canvas-editor';

export const webCanvasEditorServices: CanvasEditorServices = {
  fetchStockImages,
  fetchStockImageAsFile,
  searchUnsplashImages,
  trackUnsplashDownload,
  trackUnsplashDownloadLive,
  fetchUnsplashImageAsFile,
  openUnsplashSearch,
  useGenerateSocialPost,
  apiBaseUrl: import.meta.env.VITE_API_URL || '',
  iconifyApiUrl: import.meta.env.VITE_ICONIFY_API_URL || '',
};
