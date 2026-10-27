// SPDX-License-Identifier: MPL-2.0
import {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { messages } from '@ggraphic/editor/i18n/messages';
import { toast } from '@ggraphic/editor/utils/editorToast';

import { useCanvasEditorServices } from '../CanvasEditorProvider';
import {
  mediaLibraryOrFallback,
  type CanvasMediaItem,
  type CanvasMediaThumbProps,
  type CanvasUploadSource,
} from '../hostServices';

import type { ComponentType, ReactNode } from 'react';

const SEARCH_DEBOUNCE_MS = 300;
// Auf dem Handy ist das Löschen eine dauerhafte 44-px-Ecke jeder Kachel, die
// selbst Antippen-zum-Platzieren ist. Gelöscht wird deshalb erst nach diesem
// Fenster; bis dahin ist das Bild nur ausgeblendet und „Rückgängig“ kostenlos.
const UNDO_WINDOW_MS = 5000;

interface UserUploadsContextValue {
  items: CanvasMediaItem[];
  isLoading: boolean;
  error: string | null;
  search: string;
  setSearch: (value: string) => void;
  /**
   * Uploads to the media library. `uploadSource` defaults to 'upload' (shows in
   * the Uploads tab); pass 'canvas-element' for tool-generated images that are
   * placed straight onto the canvas and must stay out of the library.
   */
  upload: (file: File, uploadSource?: CanvasUploadSource) => Promise<CanvasMediaItem | null>;
  /** Hides the item at once and deletes it after an undo window (toast). */
  deleteFromLibrary: (id: string) => void;
  isUploading: boolean;
  uploadProgress: number;
  uploadError: string | null;
  hasMore: boolean;
  loadMore: () => Promise<void>;
  /** The host's responsive image for an item of `items`. */
  MediaThumb: ComponentType<CanvasMediaThumbProps>;
}

const UserUploadsContext = createContext<UserUploadsContextValue | null>(null);

export function UserUploadsProvider({ children }: { children: ReactNode }) {
  const [search, setSearchState] = useState('');
  const lastAppliedSearchRef = useRef('');

  // Host hooks: fixed for the lifetime of the editor (see hostServices.ts).
  const { useMediaLibrary, useMediaUpload, MediaThumb } = mediaLibraryOrFallback(
    useCanvasEditorServices().mediaLibrary
  );
  const library = useMediaLibrary({
    initialFilters: { type: 'image', sort: 'newest' },
  });

  const uploader = useMediaUpload();

  useEffect(() => {
    if (search === lastAppliedSearchRef.current) return;
    const handle = window.setTimeout(() => {
      lastAppliedSearchRef.current = search;
      library.setFilters({ search });
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(handle);
  }, [search, library]);

  const upload = useCallback(
    async (
      file: File,
      uploadSource: CanvasUploadSource = 'upload'
    ): Promise<CanvasMediaItem | null> => {
      const result = await uploader.upload(file, { uploadSource });
      if (!result) return null;
      return {
        id: result.id,
        shareToken: result.shareToken,
        title: null,
        thumbnailUrl: null,
        altText: null,
        originalFilename: file.name,
      };
    },
    [uploader]
  );

  const [pendingDeletes, setPendingDeletes] = useState<ReadonlySet<string>>(() => new Set());
  const pendingTimersRef = useRef(new Map<string, number>());
  const deleteItemRef = useRef(library.deleteItem);
  useEffect(() => {
    deleteItemRef.current = library.deleteItem;
  }, [library.deleteItem]);

  const unhide = useCallback((id: string) => {
    setPendingDeletes((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const commitDelete = useCallback(
    (id: string) => {
      pendingTimersRef.current.delete(id);
      // Schlägt das Löschen fehl, taucht das Bild wieder auf.
      void deleteItemRef.current(id).finally(() => unhide(id));
    },
    [unhide]
  );

  const deleteFromLibrary = useCallback(
    (id: string) => {
      if (pendingTimersRef.current.has(id)) return;
      setPendingDeletes((prev) => new Set(prev).add(id));
      pendingTimersRef.current.set(
        id,
        window.setTimeout(() => commitDelete(id), UNDO_WINDOW_MS)
      );
      toast(messages().uploads.imageDeleted, {
        duration: UNDO_WINDOW_MS,
        action: {
          label: messages().common.undo,
          onClick: () => {
            const timer = pendingTimersRef.current.get(id);
            if (timer === undefined) return;
            window.clearTimeout(timer);
            pendingTimersRef.current.delete(id);
            unhide(id);
          },
        },
      });
    },
    [commitDelete, unhide]
  );

  // Editor zu, bevor das Fenster abläuft: das Löschen trotzdem ausführen.
  useEffect(() => {
    const timers = pendingTimersRef.current;
    return () => {
      for (const [id, timer] of timers) {
        window.clearTimeout(timer);
        void deleteItemRef.current(id);
      }
      timers.clear();
    };
  }, []);

  const visibleItems = useMemo(
    () =>
      pendingDeletes.size === 0
        ? library.items
        : library.items.filter((item) => !pendingDeletes.has(item.id)),
    [library.items, pendingDeletes]
  );

  const value = useMemo<UserUploadsContextValue>(
    () => ({
      items: visibleItems,
      isLoading: library.isLoading,
      error: library.error,
      search,
      setSearch: setSearchState,
      upload,
      deleteFromLibrary,
      isUploading: uploader.isUploading,
      uploadProgress: uploader.progress,
      uploadError: uploader.error,
      hasMore: library.pagination.hasMore,
      loadMore: library.loadMore,
      MediaThumb,
    }),
    [
      visibleItems,
      library.isLoading,
      library.error,
      library.pagination.hasMore,
      library.loadMore,
      search,
      upload,
      deleteFromLibrary,
      uploader.isUploading,
      uploader.progress,
      uploader.error,
      MediaThumb,
    ]
  );

  return <UserUploadsContext.Provider value={value}>{children}</UserUploadsContext.Provider>;
}

/** Wie `useUserUploads`, aber `null` außerhalb des Editors (z. B. `StandaloneCanvas`). */
export function useOptionalUserUploads(): UserUploadsContextValue | null {
  return useContext(UserUploadsContext);
}

export function useUserUploads(): UserUploadsContextValue {
  const ctx = useContext(UserUploadsContext);
  if (!ctx) {
    throw new Error('useUserUploads must be used within UserUploadsProvider');
  }
  return ctx;
}
