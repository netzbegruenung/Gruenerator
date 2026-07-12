import { useShareStore } from '@gruenerator/shared/share';
import { useEffect, useRef, useCallback } from 'react';
import type * as Y from 'yjs';

import { serializeDeck } from '../collab/pagesDoc';
import { useAutoSaveStore, useAutoSaveStoreApi } from '../stores/useAutoSaveStore';

interface DeckAutoSaveOptions {
  /** The Y.Doc holding the deck's pages (usePageManager.pagesDoc). */
  ydoc: Y.Doc;
  /** Off in collab mode (Hocuspocus persists) and below two pages (per-page autosave). */
  enabled: boolean;
  /** configId of the first page — recorded as the share's sharepicType. */
  deckType: string;
  /** Fresh render of page 1, used as the gallery thumbnail. */
  captureImage: () => Promise<string | null>;
  onShareToken?: (token: string) => void;
}

const SAVE_DEBOUNCE_MS = 4000;

/**
 * Deck-level gallery autosave for local (non-collab) multi-page documents.
 *
 * The per-page useCanvasAutoSave serializes exactly one page's state, so it
 * is disabled beyond one page; this hook persists the WHOLE deck instead:
 * every Y.Doc change (template fields, layers, page ops) debounces a save of
 * `serializeDeck` under `metadata.content.pages`, with page 1's render as the
 * share image. It shares the AutoSaveStore token with the per-page path, so a
 * document growing from one page to two keeps updating the same gallery
 * record instead of forking a duplicate draft.
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
      const pages = serializeDeck(ydoc);
      const metadata = {
        sharepicType: r.deckType,
        hasOriginalImage: false,
        content: { pages },
        styling: {},
        generatedAt: new Date().toISOString(),
      };
      const title = `Canvas: ${r.deckType} (${pages.length} Seiten)`;

      const token = autoSaveStoreApi.getState().autoSavedShareToken;
      const share = token
        ? await r.updateImageShare({ shareToken: token, imageBase64: image, title, metadata })
        : await r.createImageShare({
            imageData: image,
            title,
            imageType: r.deckType,
            metadata,
            status: 'draft',
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
