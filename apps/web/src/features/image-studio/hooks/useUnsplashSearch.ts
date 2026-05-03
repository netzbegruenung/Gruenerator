import {
  useUnsplashSearch as useUnsplashSearchShared,
  type UnsplashSearchFn,
  type UseUnsplashSearchReturn,
} from '@gruenerator/shared/image-studio';
import { useCallback } from 'react';

import { searchUnsplashImages } from '../services/imageSourceService';

export function useUnsplashSearch(): UseUnsplashSearchReturn {
  const searchFn = useCallback<UnsplashSearchFn>((q, p, pp) => searchUnsplashImages(q, p, pp), []);

  return useUnsplashSearchShared(searchFn);
}
