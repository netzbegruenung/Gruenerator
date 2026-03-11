import { useUnsplashSearch as useUnsplashSearchShared } from '@gruenerator/shared/image-studio';

import { searchUnsplashImages } from '../services/imageSourceService';

import type { UseUnsplashSearchReturn } from '@gruenerator/shared/image-studio';

export function useUnsplashSearch(): UseUnsplashSearchReturn {
  return useUnsplashSearchShared((q, p, pp) => searchUnsplashImages(q, p, pp));
}
