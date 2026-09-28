import { createContext, useContext, useEffect } from 'react';

/**
 * Ids of the image elements on one canvas whose source is still loading.
 *
 * An image element draws nothing until its bitmap arrives, so a capture taken
 * meanwhile is a complete-looking picture minus the photo. The offscreen chat
 * preview asks `GenericCanvasRef.imagesSettled()` before capturing; nothing
 * else in the canvas needs to know.
 */
export const PendingImagesContext = createContext<Set<string> | null>(null);

export function useTrackPendingImage(
  id: string,
  url: string,
  status: 'loading' | 'loaded' | 'failed'
): void {
  const pending = useContext(PendingImagesContext);
  // `use-image` reports 'loading' forever for an empty url — an element with
  // no source has nothing to wait for.
  const loading = url !== '' && status === 'loading';
  useEffect(() => {
    if (!pending || !loading) return undefined;
    pending.add(id);
    return () => {
      pending.delete(id);
    };
  }, [pending, id, loading]);
}
