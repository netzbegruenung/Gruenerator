import { type StudioAssetScope } from '@gruenerator/contracts';
import { assetStickerId, type StickerRef } from '@gruenerator/shared/stickers';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { HiPlus } from 'react-icons/hi2';

import { useCanvasEditorServices } from '../../../CanvasEditorProvider';
import { GALLERY_SCOPES, GalleryTabs, StudioGalleryGrid, type GalleryTab } from '../StudioGallery';

type StickerTab = 'gruene' | StudioAssetScope;

const STICKER_TABS: readonly GalleryTab<StickerTab>[] = [
  { id: 'gruene', label: 'Grüne' },
  ...GALLERY_SCOPES,
];

/**
 * The Sticker category: the system stickers (`children`) under "Grüne", the
 * shared gallery under Entdecken / Meine / Gemerkt. Without
 * `onAddStickerAsset` only the system set.
 */
export function StickerCatalog({
  onAddStickerAsset,
  searchQuery = '',
  children,
}: {
  onAddStickerAsset?: (ref: StickerRef) => void;
  searchQuery?: string;
  children: ReactNode;
}) {
  const { openStickerCreator } = useCanvasEditorServices();
  const [tab, setTab] = useState<StickerTab>('gruene');
  const creatorOpened = useRef(false);
  const [refreshToken, setRefreshToken] = useState(0);

  // The creator runs in another tab; back here, "Meine" must show what was made there.
  useEffect(() => {
    const onFocus = () => {
      if (!creatorOpened.current) return;
      creatorOpened.current = false;
      setRefreshToken((n) => n + 1);
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, []);

  if (!onAddStickerAsset) return children;

  return (
    <div className="flex flex-col gap-3 w-full">
      <GalleryTabs label="Sticker-Auswahl" tabs={STICKER_TABS} value={tab} onChange={setTab} />
      {openStickerCreator && (
        <button
          type="button"
          onClick={() => {
            creatorOpened.current = true;
            setTab('mine');
            openStickerCreator();
          }}
          className="flex w-full items-center justify-center gap-2 h-10 rounded-lg border-[1.5px] border-dashed border-[var(--editor-border-strong)] bg-transparent text-sm font-semibold text-[var(--editor-text-secondary)] cursor-pointer transition-colors duration-150 hover:border-[var(--editor-accent)] hover:text-[var(--editor-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--editor-accent)]"
        >
          <HiPlus size={18} aria-hidden="true" />
          Sticker erstellen
        </button>
      )}
      {tab === 'gruene' ? (
        children
      ) : (
        <StudioGalleryGrid
          kind="sticker"
          scope={tab}
          query={searchQuery}
          refreshToken={refreshToken}
          onPick={(item) => onAddStickerAsset({ id: assetStickerId(item.id), src: item.src })}
        />
      )}
    </div>
  );
}
