import {
  grueneratorBlocks,
  grueneratorCarousel,
  grueneratorPrint,
} from '@gruenerator/canvas-editor';
import {
  downloadBlob,
  downloadDataUrl,
  pickShareRoute,
  shareDataUrlViaNativeHost,
} from '@gruenerator/shared';
import { useUnsplashSearch } from '@gruenerator/shared/image-studio';
import { useMediaLibrary, useMediaUpload } from '@gruenerator/shared/media-library';
import { MediaThumb } from '@gruenerator/shared/media-library/ui';
import { shareApi, useShareStore } from '@gruenerator/shared/share';
import { useStudioAssets } from '@gruenerator/shared/studio-assets';
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
import { webCanvasImageUrls } from './webCanvasImageUrls';

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
  // The @gruenerator/shared implementations the editor used to import itself.
  mediaLibrary: { useMediaLibrary, useMediaUpload, MediaThumb },
  imageShares: {
    // Through the store, as before: it also tracks `currentShare` and `isCreating`.
    createImageShare: (params) => useShareStore.getState().createImageShare(params),
    updateImageShare: (params) => useShareStore.getState().updateImageShare(params),
    publishShare: shareApi.publishShare,
  },
  imageUrls: webCanvasImageUrls,
  fileDelivery: {
    downloadBlob,
    downloadDataUrl,
    pickShareRoute,
    shareDataUrlViaNativeHost,
    filenamePrefix: 'gruenerator',
  },
  useStudioAssets,
  useUnsplashSearch,
  // Impressum gate and print Vorlagen: the Grünerator composer, also in /mobile-editor.
  print: grueneratorPrint,
  // Blocks cut out of composed slides, and the carousel chrome after page ops: the composer's too.
  blocks: grueneratorBlocks,
  carousel: grueneratorCarousel,
};
