import { lazy } from 'react';

import { generateSlideAltTexts } from './services/altTextService';
import { removeBackgroundFromImage } from './services/backgroundRemovalService';
import { editAiImage, expandCanvasImage } from './services/imageEditingService';
import {
  fetchStockImages,
  fetchStockImageAsFile,
  searchUnsplashImages,
  trackUnsplashDownload,
  trackUnsplashDownloadLive,
  openUnsplashSearch,
  generateAiImage,
} from './services/imageSourceService';
import { uploadBlobToMediaLibrary } from './services/mediaUploadService';

import type { CanvasEditorServices } from '@gruenerator/canvas-editor';

// Neuer Tab, damit der Editor seinen ungespeicherten Stand behält.
const openStickerCreator = () => {
  window.open('/studio/sticker/neu?return=canvas', '_blank', 'noopener');
};

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
  openUnsplashSearch,
  openStickerCreator,
  generateAiImage,
  uploadImage: uploadBlobToMediaLibrary,
  removeBackgroundFromImage,
  editAiImage,
  expandImage: expandCanvasImage,
  generateSlideAltTexts,
  ChatSectionContent: CanvasInlineChatSection,
  apiBaseUrl: (import.meta.env.VITE_API_URL as string | undefined) ?? '',
};
