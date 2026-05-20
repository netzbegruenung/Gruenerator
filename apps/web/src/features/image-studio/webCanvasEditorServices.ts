import { CanvasInlineChatSection } from './CanvasInlineChatSection';
import { removeBackgroundFromImage } from './services/backgroundRemovalService';
import { editAiImage } from './services/imageEditingService';
import {
  fetchStockImages,
  fetchStockImageAsFile,
  searchUnsplashImages,
  trackUnsplashDownload,
  trackUnsplashDownloadLive,
  fetchUnsplashImageAsFile,
  openUnsplashSearch,
  generateAiImage,
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
  generateAiImage,
  removeBackgroundFromImage,
  editAiImage,
  useGenerateCanvasSuggestions,
  ChatSectionContent: CanvasInlineChatSection,
  apiBaseUrl: (import.meta.env.VITE_API_URL as string | undefined) ?? '',
  iconifyApiUrl: (import.meta.env.VITE_ICONIFY_API_URL as string | undefined) ?? '',
};
