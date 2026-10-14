import { lazy } from 'react';

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
import { uploadBlobToMediaLibrary } from './services/mediaUploadService';

import type { CanvasEditorServices } from '@gruenerator/canvas-editor';

// Lazy: der Chat-Tab ist meist zu, und assistant-ui samt Markdown-Stack gehört
// nicht in den Startpfad. Der Editor rendert Sektionen in einer Suspense-Grenze.
const CanvasInlineChatSection = lazy(() =>
  import('./CanvasInlineChatSection').then((m) => ({ default: m.CanvasInlineChatSection }))
);

export const webCanvasEditorServices: CanvasEditorServices = {
  fetchStockImages,
  fetchStockImageAsFile,
  searchUnsplashImages,
  trackUnsplashDownload,
  trackUnsplashDownloadLive,
  fetchUnsplashImageAsFile,
  openUnsplashSearch,
  generateAiImage,
  uploadImage: uploadBlobToMediaLibrary,
  removeBackgroundFromImage,
  editAiImage,
  ChatSectionContent: CanvasInlineChatSection,
  apiBaseUrl: (import.meta.env.VITE_API_URL as string | undefined) ?? '',
};
