import {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { useMediaLibrary, useMediaUpload } from '@gruenerator/shared/media-library';

import type { ReactNode } from 'react';
import type { MediaItem } from '@gruenerator/shared/media-library';

const SEARCH_DEBOUNCE_MS = 300;

interface UserUploadsContextValue {
  items: MediaItem[];
  isLoading: boolean;
  error: string | null;
  search: string;
  setSearch: (value: string) => void;
  upload: (file: File) => Promise<MediaItem | null>;
  deleteFromLibrary: (id: string) => Promise<boolean>;
  isUploading: boolean;
  uploadProgress: number;
  uploadError: string | null;
  hasMore: boolean;
  loadMore: () => Promise<void>;
}

const UserUploadsContext = createContext<UserUploadsContextValue | null>(null);

export function UserUploadsProvider({ children }: { children: ReactNode }) {
  const [search, setSearchState] = useState('');
  const lastAppliedSearchRef = useRef('');

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
    async (file: File): Promise<MediaItem | null> => {
      const result = await uploader.upload(file, { uploadSource: 'upload' });
      if (!result) return null;
      return {
        id: result.id,
        shareToken: result.shareToken,
        mediaType: result.mediaType,
        title: null,
        thumbnailUrl: null,
        fileSize: file.size,
        mimeType: file.type,
        altText: null,
        uploadSource: 'upload',
        originalFilename: file.name,
        downloadCount: 0,
        viewCount: 0,
        createdAt: result.createdAt,
      };
    },
    [uploader]
  );

  const deleteFromLibrary = useCallback(
    async (id: string): Promise<boolean> => library.deleteItem(id),
    [library]
  );

  const value = useMemo<UserUploadsContextValue>(
    () => ({
      items: library.items,
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
    }),
    [
      library.items,
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
    ]
  );

  return <UserUploadsContext.Provider value={value}>{children}</UserUploadsContext.Provider>;
}

export function useUserUploads(): UserUploadsContextValue {
  const ctx = useContext(UserUploadsContext);
  if (!ctx) {
    throw new Error('useUserUploads must be used within UserUploadsProvider');
  }
  return ctx;
}
