import { useUnsplashSearch as useUnsplashSearchShared } from '@gruenerator/shared/image-studio';

import { useCanvasEditorServices } from '../CanvasEditorProvider';

import type { UseUnsplashSearchReturn } from '@gruenerator/shared/image-studio';

export function useUnsplashSearch(): UseUnsplashSearchReturn {
  const { searchUnsplashImages } = useCanvasEditorServices();

  return useUnsplashSearchShared(
    searchUnsplashImages
      ? (q, p, pp) => searchUnsplashImages(q, p, pp)
      : async () => ({ results: [], total: 0, total_pages: 0 })
  );
}
