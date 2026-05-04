import { useCallback } from 'react';

import {
  useUnsplashSearch as useUnsplashSearchShared,
  type UnsplashSearchFn,
} from '@gruenerator/shared/image-studio';

import { useCanvasEditorServices } from '../CanvasEditorProvider';

import type { UseUnsplashSearchReturn } from '@gruenerator/shared/image-studio';

export function useUnsplashSearch(): UseUnsplashSearchReturn {
  const { searchUnsplashImages } = useCanvasEditorServices();

  const searchFn = useCallback<UnsplashSearchFn>(
    async (q, p, pp) => {
      if (searchUnsplashImages) return searchUnsplashImages(q, p, pp);
      return { results: [], total: 0, total_pages: 0 };
    },
    [searchUnsplashImages]
  );

  return useUnsplashSearchShared(searchFn);
}
