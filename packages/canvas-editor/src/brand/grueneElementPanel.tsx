/**
 * What the Grünerator adds to the Elemente panel: the Balken tiles of the
 * Marke category, the Blöcke category, its wording and the Balken previews.
 * Part of the Grünerator's asset catalogue (`GRUENE_ASSET_CATALOG`).
 */
import { useMemo } from 'react';

import { sharepicBlockThumbPath, type SharepicBlock } from '@gruenerator/contracts';

import { useBlockInsert } from '../components/CanvasEditor/blockInsert';
import {
  SingleBalkenPreviewIcon,
  TripleBalkenPreviewIcon,
} from '../sidebar/sections/BadgePreviewIcons';

import type {
  ElementBlocks,
  ElementPanelHost,
} from '@ggraphic/editor/sidebar/sections/assets/elementPanelHost';
import type { ElementItem } from '@ggraphic/editor/sidebar/sections/assets/elementTypes';

const BALKEN_ITEMS: ElementItem[] = [
  {
    key: 'balken:single',
    label: 'Balken',
    keywords: ['balken', 'text', 'marke'],
    action: { kind: 'balken', mode: 'single' },
    thumb: { t: 'balken', mode: 'single' },
  },
  {
    key: 'balken:triple',
    label: 'Dreifach-Balken',
    keywords: ['balken', 'dreizeilen', 'text', 'marke'],
    action: { kind: 'balken', mode: 'triple' },
    thumb: { t: 'balken', mode: 'triple' },
  },
];

/** Group headings of the Blöcke category, in display order. */
const BLOCK_GRUPPEN: Record<SharepicBlock['gruppe'], string> = {
  kopf: 'Kopf',
  listen: 'Listen',
  text: 'Text',
  zahlen: 'Zahlen & Fakten',
  meldungen: 'Termine & Meldungen',
};

/** A Grünerator-Block as a tile: its preview is the block alone, cut to its bounds. */
function blockItem(block: SharepicBlock): ElementItem {
  return {
    key: `block:${block.id}`,
    label: block.titel,
    keywords: [block.titel, BLOCK_GRUPPEN[block.gruppe], ...block.stichworte],
    action: { kind: 'block', blockId: block.id },
    thumb: { t: 'img', src: sharepicBlockThumbPath(block.id, block.thumbVersion) },
  };
}

function useGrueneBlocks(): ElementBlocks | null {
  const blocks = useBlockInsert();
  return useMemo(() => {
    if (!blocks) return null;
    const bloecke = blocks.bloecke;
    return {
      label: 'Blöcke',
      items: bloecke.map(blockItem),
      groups: (Object.keys(BLOCK_GRUPPEN) as SharepicBlock['gruppe'][]).map((gruppe) => ({
        label: BLOCK_GRUPPEN[gruppe],
        keys: bloecke.filter((b) => b.gruppe === gruppe).map((b) => `block:${b.id}`),
      })),
      isLoading: blocks.isLoading,
      has: (blockId) => bloecke.some((b) => b.id === blockId),
      insert: (blockId) => blocks.insert(blockId),
    };
  }, [blocks]);
}

export const GRUENE_ELEMENT_PANEL: ElementPanelHost = {
  stickerListLabel: 'Grüne',
  noResultsHint: (locale) =>
    locale === 'de-AT'
      ? 'Versuch es mit „Logo“, „Kreis“ oder „Rahmen“.'
      : 'Versuch es mit „Sonnenblume“, „Balken“ oder „Rahmen“.',
  // The Balken are a German design element: Austrian users get none.
  brandItems: ({ locale, canAdd }) => (canAdd('balken') && locale === 'de-DE' ? BALKEN_ITEMS : []),
  useBlocks: useGrueneBlocks,
  HostThumb: ({ thumb, size }) =>
    thumb.mode === 'single' ? (
      <SingleBalkenPreviewIcon size={size} />
    ) : (
      <TripleBalkenPreviewIcon size={size} />
    ),
};
