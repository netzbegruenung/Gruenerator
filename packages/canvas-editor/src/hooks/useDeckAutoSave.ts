import { useShareStore } from '@gruenerator/shared/share';
import { useEffect, useRef, useCallback } from 'react';
import type * as Y from 'yjs';

import { serializeDeck, type SerializedPage } from '../collab/pagesDoc';
import { useAutoSaveStore, useAutoSaveStoreApi } from '../stores/useAutoSaveStore';

interface DeckAutoSaveOptions {
  /** The Y.Doc holding the deck's pages (usePageManager.pagesDoc). */
  ydoc: Y.Doc;
  /** Off in collab mode (Hocuspocus persists server-side). */
  enabled: boolean;
  /** configId of the first page — recorded as the share's sharepicType. */
  deckType: string;
  /** Fresh render of page 1, used as the gallery thumbnail. */
  captureImage: () => Promise<string | null>;
  onShareToken?: (token: string) => void;
}

const SAVE_DEBOUNCE_MS = 4000;

/**
 * Placeholder written into serialized page state where a transient background
 * (blob:/data: URL) was persisted into the share's original-image slot.
 * Restore substitutes it with the re-fetched `/share/:token/original` URL.
 */
export const SHARE_ORIGINAL_IMAGE_SRC = 'share:original';

const IMAGE_SRC_KEYS = ['currentImageSrc', 'imageSrc'] as const;

const isTransientUrl = (src: unknown): src is string =>
  typeof src === 'string' && (src.startsWith('blob:') || src.startsWith('data:'));

async function blobUrlToBase64(url: string): Promise<string | null> {
  try {
    const blob = await (await fetch(url)).blob();
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

/**
 * Transient background URLs (blob: object URLs from the studio form flow)
 * die with the session — persist the first one into the share's single
 * original-image slot (the same mechanism the legacy per-page autosave used)
 * and mark its occurrences in the serialized state for restore. Additional
 * DISTINCT transient sources exceed that one slot and are left as-is.
 */
async function extractOriginalImage(
  pages: SerializedPage[]
): Promise<{ pages: SerializedPage[]; originalImageBase64: string | null }> {
  let originalSrc: string | null = null;
  for (const page of pages) {
    for (const key of IMAGE_SRC_KEYS) {
      const src = page.state[key];
      if (isTransientUrl(src)) {
        originalSrc = src;
        break;
      }
    }
    if (originalSrc) break;
  }
  if (!originalSrc) return { pages, originalImageBase64: null };

  const originalImageBase64 = await blobUrlToBase64(originalSrc);
  if (!originalImageBase64) return { pages, originalImageBase64: null };

  const mapped = pages.map((page) => {
    let state: Record<string, unknown> | null = null;
    for (const key of IMAGE_SRC_KEYS) {
      const src = page.state[key];
      if (src === originalSrc) {
        state = state ?? { ...page.state };
        state[key] = SHARE_ORIGINAL_IMAGE_SRC;
      } else if (isTransientUrl(src)) {
        console.warn(
          '[DeckAutoSave] additional transient background image cannot be persisted (one original-image slot per share)'
        );
      }
    }
    return state ? { ...page, state } : page;
  });
  return { pages: mapped, originalImageBase64 };
}

/**
 * Gallery autosave for local (non-collab) canvas documents — the ONLY
 * gallery writer in the multi-page editor, regardless of page count (a
 * single-page doc is just a one-page deck). Every Y.Doc change (template
 * fields, layers, page ops) debounces a save of `serializeDeck` under
 * `metadata.content.pages`, with page 1's render as the share image. The
 * deck shape is lossless and type-agnostic, so every template round-trips —
 * unlike the legacy per-type field whitelist, which stays read-only for old
 * drafts.
 */
export function useDeckAutoSave({
  ydoc,
  enabled,
  deckType,
  captureImage,
  onShareToken,
}: DeckAutoSaveOptions): void {
  const autoSaveStoreApi = useAutoSaveStoreApi();
  const setAutoSaveStatus = useAutoSaveStore((s) => s.setAutoSaveStatus);
  const setAutoSavedShareToken = useAutoSaveStore((s) => s.setAutoSavedShareToken);
  const { createImageShare, updateImageShare } = useShareStore();

  const refs = useRef({
    enabled,
    deckType,
    captureImage,
    onShareToken,
    createImageShare,
    updateImageShare,
    setAutoSaveStatus,
    setAutoSavedShareToken,
  });
  refs.current = {
    enabled,
    deckType,
    captureImage,
    onShareToken,
    createImageShare,
    updateImageShare,
    setAutoSaveStatus,
    setAutoSavedShareToken,
  };

  const pendingRef = useRef(false);

  const performSave = useCallback(async () => {
    const r = refs.current;
    if (!r.enabled) return;
    const store = autoSaveStoreApi.getState();
    if (store.autoSaveStatus === 'saving') {
      // A save is in flight with an older snapshot — remember to re-run.
      pendingRef.current = true;
      return;
    }

    const image = await r.captureImage();
    if (!image) return;

    r.setAutoSaveStatus('saving');
    try {
      const { pages, originalImageBase64 } = await extractOriginalImage(serializeDeck(ydoc));
      const metadata = {
        sharepicType: r.deckType,
        hasOriginalImage: originalImageBase64 !== null,
        content: { pages },
        styling: {},
        generatedAt: new Date().toISOString(),
      };
      const title =
        pages.length > 1
          ? `Canvas: ${r.deckType} (${pages.length} Seiten)`
          : `Canvas: ${r.deckType}`;

      const token = autoSaveStoreApi.getState().autoSavedShareToken;
      const share = token
        ? await r.updateImageShare({
            shareToken: token,
            imageBase64: image,
            title,
            metadata,
            ...(originalImageBase64 ? { originalImage: originalImageBase64 } : {}),
          })
        : await r.createImageShare({
            imageData: image,
            title,
            imageType: r.deckType,
            metadata,
            status: 'draft',
            ...(originalImageBase64 ? { originalImage: originalImageBase64 } : {}),
          });

      if (share?.shareToken) {
        r.setAutoSavedShareToken(share.shareToken);
        r.setAutoSaveStatus('saved');
        autoSaveStoreApi.getState().setDirty(false);
        r.onShareToken?.(share.shareToken);
      } else {
        r.setAutoSaveStatus('error');
      }
    } catch (error) {
      console.error('[DeckAutoSave] save failed:', error);
      refs.current.setAutoSaveStatus('error');
    }

    if (pendingRef.current) {
      pendingRef.current = false;
      void performSave();
    }
  }, [autoSaveStoreApi, ydoc]);

  // Feature parity with the per-page path this hook replaces in deck mode:
  // the sidebar's retry action and the unsaved-edits unload warning.
  useEffect(() => {
    if (!enabled) return undefined;
    autoSaveStoreApi.getState().setRetryAutoSave(() => {
      void performSave();
    });
    return () => autoSaveStoreApi.getState().setRetryAutoSave(null);
  }, [enabled, autoSaveStoreApi, performSave]);

  useEffect(() => {
    if (!enabled) return undefined;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      const s = autoSaveStoreApi.getState();
      if (s.autoSaveStatus === 'saving' || s.isDirty) e.preventDefault();
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [enabled, autoSaveStoreApi]);

  useEffect(() => {
    if (!enabled) return undefined;

    let timer: ReturnType<typeof setTimeout> | null = null;

    const onUpdate = (
      _update: Uint8Array,
      _origin: unknown,
      _doc: unknown,
      transaction: { local: boolean }
    ) => {
      if (!transaction.local) return;
      autoSaveStoreApi.getState().setDirty(true);
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        void performSave();
      }, SAVE_DEBOUNCE_MS);
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden' && timer) {
        clearTimeout(timer);
        timer = null;
        void performSave();
      }
    };

    ydoc.on('update', onUpdate);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      ydoc.off('update', onUpdate);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      if (timer) {
        clearTimeout(timer);
        // Unmount flush — captureImage no-ops once the stage is gone.
        void performSave();
      }
    };
  }, [enabled, ydoc, performSave, autoSaveStoreApi]);
}
