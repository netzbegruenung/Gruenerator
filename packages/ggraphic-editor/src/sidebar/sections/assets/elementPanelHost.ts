// SPDX-License-Identifier: MPL-2.0
import type { ElementItem } from './elementTypes';
import type { AssetAudience } from '@ggraphic/editor/utils/canvasAssets';
import type { ComponentType } from 'react';

/** A host's block catalogue as the Elemente panel reads it. */
export interface ElementBlocks {
  /** Name of the category. */
  label: string;
  /** One tile per block the active page can take, in catalogue order. */
  items: ElementItem[];
  /** The headings the tiles are listed under, in display order; `keys` are `ElementItem.key`s. */
  groups: readonly { label: string; keys: readonly string[] }[];
  isLoading: boolean;
  has: (blockId: string) => boolean;
  insert: (blockId: string) => Promise<unknown>;
}

/**
 * What a host adds to the Elemente panel beyond the generic categories
 * (`CanvasAssetCatalog.elementPanel`). Everything is optional: without it the
 * panel shows only the generic categories and their tiles.
 */
export interface ElementPanelHost {
  /** Label of the sticker chip that lists the catalogue's own stickers. */
  stickerListLabel?: string;
  /** The line under an empty search result. */
  noResultsHint?: (locale: AssetAudience) => string;
  /** Tiles for the brand category, between the logos and the marks; `canAddBalken`: whether this editor can place a Balken. */
  brandItems?: (context: { locale: AssetAudience; canAddBalken: boolean }) => ElementItem[];
  /** Hook: the block catalogue, or null while there is none. Called once per render. */
  useBlocks?: () => ElementBlocks | null;
  /** Preview of a Balken tile. */
  BalkenPreview?: ComponentType<{ mode: 'single' | 'triple'; size: number }>;
}
