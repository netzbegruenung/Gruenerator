// SPDX-License-Identifier: MPL-2.0
import { useCanvasEditorServices } from '@ggraphic/editor/CanvasEditorProvider';
import {
  type CanvasStudioAssetItem,
  type CanvasStudioAssetScope,
} from '@ggraphic/editor/hostServices';
import { useMessages } from '@ggraphic/editor/i18n/messages';
import { registeredAssetCatalog, studioStickerId } from '@ggraphic/editor/utils/canvasAssets';
import { type StickerRef } from '@ggraphic/schema';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { HiPlus } from 'react-icons/hi2';

import {
  GalleryTabs,
  StudioGalleryGrid,
  useGalleryScopes,
  type GalleryTab,
} from '../StudioGallery';

import { elementDragProps } from './ElementTile';
import { galleryStickerItem } from './elementTypes';

type StickerTab = 'catalog' | CanvasStudioAssetScope;

const galleryRef = (item: CanvasStudioAssetItem): StickerRef => ({
  id: studioStickerId(item.id),
  src: item.src,
});

/**
 * The Sticker category: the catalogue's stickers (`children`) under the host's
 * label (`elementPanel.stickerListLabel`), the shared gallery under Entdecken / Meine / Gemerkt. Without
 * `onAddStickerAsset` only the system set.
 */
export function StickerCatalog({
  onAddStickerAsset,
  searchQuery = '',
  canDrag,
  children,
}: {
  onAddStickerAsset?: (ref: StickerRef) => void;
  searchQuery?: string;
  /** Mouse drag onto a page; off on touch layouts. */
  canDrag: boolean;
  children: ReactNode;
}) {
  const t = useMessages();
  const { openStickerCreator } = useCanvasEditorServices();
  const scopes = useGalleryScopes();
  const listLabel = registeredAssetCatalog().elementPanel?.stickerListLabel ?? 'Standard';
  const tabs = useMemo<readonly GalleryTab<StickerTab>[]>(
    () => [{ id: 'catalog', label: listLabel }, ...scopes],
    [listLabel, scopes]
  );
  const [tab, setTab] = useState<StickerTab>('catalog');
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
      <GalleryTabs
        label={t.sidebar.elements.stickerPicker}
        tabs={tabs}
        value={tab}
        onChange={setTab}
      />
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
          {t.sidebar.elements.createSticker}
        </button>
      )}
      {tab === 'catalog' ? (
        children
      ) : (
        <StudioGalleryGrid
          kind="sticker"
          scope={tab}
          query={searchQuery}
          refreshToken={refreshToken}
          onPick={(item) => onAddStickerAsset(galleryRef(item))}
          {...(canDrag
            ? { dragProps: (item) => elementDragProps(galleryStickerItem(galleryRef(item))) }
            : {})}
        />
      )}
    </div>
  );
}
