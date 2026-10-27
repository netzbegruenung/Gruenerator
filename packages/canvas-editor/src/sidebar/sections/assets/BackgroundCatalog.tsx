import { useCanvasEditorServices } from '@ggraphic/editor/CanvasEditorProvider';
import { plainImageUrls, type CanvasStudioAssetItem } from '@ggraphic/editor/hostServices';
import { fetchShareImageFile } from '@ggraphic/editor/utils/mediaPlacement';
import { type StudioAssetScope } from '@gruenerator/contracts';
import { isShareSrc } from '@gruenerator/contracts';
import { useRef, useState } from 'react';

import { GALLERY_SCOPES, GalleryTabs, StudioGalleryGrid } from '../StudioGallery';

import type { BackgroundControls } from '@ggraphic/editor/configs/types';
import { useMessages } from '@ggraphic/editor/i18n/messages';

type ImageChange = NonNullable<BackgroundControls['onImageChange']>;

/**
 * A gallery pick becomes the template's background photo with the gallery's own
 * durable URL, so nothing is uploaded again. Only the newest pick may land.
 */
function useBackgroundPick(onImageChange: ImageChange) {
  const t = useMessages();
  const seqRef = useRef(0);
  const { imageUrls = plainImageUrls } = useCanvasEditorServices();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pick = async (item: CanvasStudioAssetItem) => {
    if (!isShareSrc(item.src)) return;
    const seq = ++seqRef.current;
    setError(null);
    setPendingId(item.id);
    try {
      const file = await fetchShareImageFile(item.src, item.title, imageUrls);
      if (seq === seqRef.current) onImageChange(file, item.src, null);
    } catch {
      if (seq === seqRef.current) setError(t.sidebar.elements.backgroundLoadFailed);
    } finally {
      if (seq === seqRef.current) setPendingId(null);
    }
  };

  return { pick, pendingId, error };
}

/** The shared gallery's backgrounds (Entdecken / Meine / Gemerkt). */
export function BackgroundCatalog({
  currentImageSrc,
  onImageChange,
  searchQuery = '',
}: {
  currentImageSrc?: string;
  onImageChange: ImageChange;
  searchQuery?: string;
}) {
  const t = useMessages();
  const [scope, setScope] = useState<StudioAssetScope>('shop');
  const { pick, pendingId, error } = useBackgroundPick(onImageChange);

  return (
    <div className="flex flex-col gap-3 w-full">
      <GalleryTabs
        label={t.sidebar.elements.backgroundPicker}
        tabs={GALLERY_SCOPES}
        value={scope}
        onChange={setScope}
      />
      {error && (
        <div
          role="alert"
          className="text-xs text-[var(--editor-danger-fg)] bg-[var(--editor-danger-bg)] rounded-md px-2 py-1"
        >
          {error}
        </div>
      )}
      <StudioGalleryGrid
        kind="background"
        scope={scope}
        query={searchQuery}
        pendingId={pendingId}
        selectedSrc={currentImageSrc ?? ''}
        onPick={(item) => void pick(item)}
      />
    </div>
  );
}
