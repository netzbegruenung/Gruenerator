// SPDX-License-Identifier: MPL-2.0
import { useCanvasEditorServices } from '@ggraphic/editor/CanvasEditorProvider';
import { useAllIconsCatalog, useIconCatalog } from '@ggraphic/editor/hooks/useIconCatalog';
import { useNoStudioAssets } from '@ggraphic/editor/hostServices';
import { useMessages } from '@ggraphic/editor/i18n/messages';
import {
  assetMatchesLocale,
  hasDarkPreview,
  plainAssetImageUrls,
  registeredAssetCatalog,
  type AssetAudience,
  type UniversalAsset,
} from '@ggraphic/editor/utils/canvasAssets';
import { CHART_TYPE_DEFS } from '@ggraphic/editor/utils/chartUtils';
import {
  FRAME_CATEGORY_ORDER,
  FRAME_PRESETS,
  getFramePreset,
} from '@ggraphic/editor/utils/frameUtils';
import { getAllIllustrations } from '@ggraphic/editor/utils/illustrations/registry';
import { getShapeDef } from '@ggraphic/editor/utils/shapes';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState, type ReactNode } from 'react';
import { PiImageFill } from 'react-icons/pi';

import { useEmojiCatalog } from '../../../hooks/useEmojiCatalog';
import { withTone } from '../../../utils/emoji/emojiCatalog';
import { KAWAII_ILLUSTRATIONS } from '@ggraphic/editor/utils/illustrations/kawaii';
import {
  ALL_PALETTE_SHAPES,
  getShapeVariant,
} from '@ggraphic/editor/sidebar/sections/FormenSection';

import { ElementThumb } from './ElementThumb';
import { useStockPhotos } from './useStockPhotos';

import type { ElementBlocks } from './elementPanelHost';
import type { ExtendedAssetsSectionProps } from './AssetsSection';
import type { AssetView } from '@ggraphic/editor/sidebar/sections/assets/constants';
import type { ElementAction, ElementItem } from './elementTypes';
import type { IconDef } from '@ggraphic/editor/utils/canvasIcons';
import type { IllustrationDef } from '@ggraphic/editor/utils/illustrations/types';

export type CategoryId = Exclude<AssetView, 'browse'>;

export interface CatalogCategory {
  id: CategoryId;
  label: string;
  tint: 'primary' | 'secondary';
  cover: ReactNode;
  /** Null when the size is unknown up front (galleries). */
  count: number | null;
  items: ElementItem[];
  isLoading: boolean;
  /** Galleries search server-side in their own grid, not in the shared one. */
  searchable: boolean;
}

// --- Item builders (pure; the action carries everything a click or drop needs) ---

export function assetItem(asset: UniversalAsset): ElementItem {
  return {
    key: `asset:${asset.id}`,
    label: asset.label,
    keywords: asset.tags,
    action: { kind: 'asset', assetId: asset.id },
    thumb: { t: 'img', src: asset.src, ...(hasDarkPreview(asset) ? { inverse: true } : {}) },
  };
}

export const SHAPE_ITEMS: ElementItem[] = ALL_PALETTE_SHAPES.map((shape) => {
  const def = getShapeDef(shape.id);
  return {
    key: `shape:${shape.id}`,
    get label() {
      return def.name;
    },
    keywords: def.tags,
    action: { kind: 'shape', shapeType: shape.id, color: getShapeVariant(shape.id).color },
    thumb: { t: 'shape', shapeType: shape.id },
  };
});

export const CHART_ITEMS: ElementItem[] = CHART_TYPE_DEFS.map((def) => ({
  key: `chart:${def.id}`,
  get label() {
    return def.name;
  },
  keywords: def.tags,
  action: { kind: 'chart', chartType: def.id },
  thumb: { t: 'chart', chartType: def.id },
}));

export const FRAME_ITEMS: ElementItem[] = [...FRAME_PRESETS]
  .sort(
    (a, b) =>
      FRAME_CATEGORY_ORDER.indexOf(getFramePreset(a.id).category) -
      FRAME_CATEGORY_ORDER.indexOf(getFramePreset(b.id).category)
  )
  .map((preset) => ({
    key: `frame:${preset.id}`,
    get label() {
      return preset.name;
    },
    keywords: preset.tags,
    action: { kind: 'frame', clipType: preset.id },
    thumb: { t: 'frame', clipType: preset.id },
  }));

/** What the host's catalogue offers under one `category`, in its order. */
function offeredAssets(category: UniversalAsset['category']): UniversalAsset[] {
  const catalog = registeredAssetCatalog();
  return (catalog.offered ?? catalog.assets).filter((a) => a.category === category);
}

export function illustrationItem(def: IllustrationDef): ElementItem {
  return {
    key: `illustration:${def.id}`,
    label: def.name,
    // The German category ("Menschen", "Natur") is often the only German word on an undraw entry.
    keywords: def.source !== 'kawaii' && def.category ? [...def.tags, def.category] : def.tags,
    action: { kind: 'illustration', id: def.id },
    thumb: def.source === 'kawaii' ? { t: 'kawaii', id: def.id } : { t: 'svg', def },
  };
}

/** Shown before the full catalogue (~2,000 entries) has loaded, and as the card cover. */
function featuredIllustrationItems(): ElementItem[] {
  return [...KAWAII_ILLUSTRATIONS, ...(registeredAssetCatalog().illustrations?.featured ?? [])].map(
    illustrationItem
  );
}

export function iconItem(icon: IconDef): ElementItem {
  return {
    key: `icon:${icon.id}`,
    label: icon.name,
    keywords: [icon.name.replace(/-/g, ' '), icon.library],
    action: { kind: 'icon', iconId: icon.id },
    thumb: { t: 'icon', iconId: icon.id },
  };
}

const ILLUSTRATIONS_QUERY_KEY = ['canvas', 'illustrations', 'all'] as const;

const NO_RECOMMENDED: string[] = [];
const NO_ITEMS: ElementItem[] = [];
const useNoBlocks = (): ElementBlocks | null => null;

/**
 * The gallery backgrounds come from the host's Studio and are not ready
 * for the Elemente tab yet; flip this once they are.
 */
const SHOW_GALLERY_BACKGROUNDS = false;

/** Whether this editor can perform the action — a config without shapes hides shape tiles. */
export function canRun(
  action: ElementAction,
  props: ExtendedAssetsSectionProps,
  blocks: ElementBlocks | null = null
): boolean {
  switch (action.kind) {
    case 'asset':
      return props.onAddAsset !== undefined;
    case 'sticker':
      return props.onAddStickerAsset !== undefined;
    case 'shape':
      return props.onAddShape !== undefined;
    case 'illustration':
      return props.onAddIllustration !== undefined;
    case 'chart':
      return props.onAddChart !== undefined;
    case 'frame':
      return props.onAddFrame !== undefined;
    case 'balken':
      return props.onAddBalken !== undefined;
    case 'media':
      return props.onAddImageFromUrl !== undefined;
    case 'icon':
      return props.onIconToggle !== undefined && props.selectedIcons !== undefined;
    case 'block':
      return !!blocks?.has(action.blockId);
  }
}

function cover(items: readonly ElementItem[]): ReactNode {
  const first = items[0];
  if (!first) return null;
  if (first.thumb.t === 'photo') {
    return (
      <span className="relative block size-14 rounded-lg overflow-hidden shadow-sm">
        <ElementThumb thumb={first.thumb} eager />
      </span>
    );
  }
  return (
    <span className="relative grid place-items-center size-14 [&_img]:size-full">
      <ElementThumb thumb={first.thumb} eager />
    </span>
  );
}

function BackgroundCover() {
  const { useStudioAssets = useNoStudioAssets } = useCanvasEditorServices();
  const { items } = useStudioAssets({ kind: 'background', scope: 'shop', q: '', sort: 'new' });
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const first = items[0];
  const src = first
    ? (first.thumbUrl ??
      (registeredAssetCatalog().imageUrls ?? plainAssetImageUrls).thumbnail(first.src, 200))
    : null;
  if (!src || src === failedSrc)
    return <PiImageFill size={40} className="text-editor-secondary-fg" />;
  return (
    <span className="relative block size-14 rounded-lg overflow-hidden shadow-sm">
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- onError ist ein technischer Ladefehler-Fallback, keine Bedienung */}
      <img
        src={src}
        alt=""
        decoding="async"
        onError={() => setFailedSrc(src)}
        className="absolute inset-0 size-full object-cover"
      />
    </span>
  );
}

/**
 * Every Elemente category this editor offers, in display order, with its tiles.
 * The big sets (all illustrations, all icon sets) load only once `needFull`
 * asks for them — a search, or that category being open.
 */
export function useElementCatalog(
  props: ExtendedAssetsSectionProps,
  needFull: { illustrations: boolean; icons: boolean; photos: boolean; emoji: boolean },
  /** Skin tone of the emoji tiles: 0 default, 1–5 light → dark. */
  emojiTone = 0
): CatalogCategory[] {
  const t = useMessages();
  const { userLocale = 'de-DE', fetchStockImages } = useCanvasEditorServices();
  const panelHost = registeredAssetCatalog().elementPanel;
  const locale: AssetAudience = userLocale;
  const recommendedAssetIds = props.recommendedAssetIds ?? NO_RECOMMENDED;

  const hasAssets = props.onAddAsset !== undefined;
  const hasBalken = props.onAddBalken !== undefined;
  const hasIcons = props.onIconToggle !== undefined && props.selectedIcons !== undefined;
  const hasIllustrations = props.onAddIllustration !== undefined;
  const hasPhotos = props.onAddImageFromUrl !== undefined && fetchStockImages !== undefined;

  const { data: defaultIcons, isLoading: iconsLoading } = useIconCatalog();
  const { data: allIcons } = useAllIconsCatalog(hasIcons && needFull.icons);
  const allIllustrations = useQuery({
    queryKey: ILLUSTRATIONS_QUERY_KEY,
    queryFn: getAllIllustrations,
    enabled: hasIllustrations && needFull.illustrations,
    staleTime: Infinity,
    gcTime: Infinity,
  });
  const emojiCatalog = useEmojiCatalog(hasAssets && needFull.emoji);
  const useBlocks = panelHost?.useBlocks ?? useNoBlocks;
  const blocks = useBlocks();
  const blockItems = blocks?.items ?? NO_ITEMS;
  // The photo catalogue is small and gives the Fotos card its cover: load it with the tab.
  const photos = useStockPhotos(hasPhotos);

  const markeItems = useMemo(() => {
    // Logos in the locale's order, the recommended ones first.
    const logos = hasAssets
      ? offeredAssets('decoration').filter((a) => assetMatchesLocale(a, locale))
      : [];
    const sortedLogos = [
      ...logos.filter((a) => recommendedAssetIds.includes(a.id)),
      ...logos.filter((a) => !recommendedAssetIds.includes(a.id)),
    ].map(assetItem);
    const marks = hasAssets
      ? offeredAssets('mark')
          .filter((a) => assetMatchesLocale(a, locale))
          .map(assetItem)
      : [];
    const hostItems = panelHost?.brandItems?.({ locale, canAddBalken: hasBalken }) ?? [];
    return [...sortedLogos, ...hostItems, ...marks];
  }, [hasAssets, hasBalken, recommendedAssetIds, locale, panelHost]);

  const stickerItems = useMemo(
    () =>
      hasAssets
        ? offeredAssets('sticker')
            .filter((a) => assetMatchesLocale(a, locale))
            .map(assetItem)
        : [],
    [hasAssets, locale]
  );

  const iconItems = useMemo(
    () => ((needFull.icons && allIcons) || defaultIcons || []).map(iconItem),
    [needFull.icons, allIcons, defaultIcons]
  );

  const featuredIllustrations = useMemo(featuredIllustrationItems, []);
  const illustrationItems = useMemo(
    () => allIllustrations.data?.map(illustrationItem) ?? featuredIllustrations,
    [allIllustrations.data, featuredIllustrations]
  );

  const emojiItems = useMemo(() => {
    // The host's curated emoji: first in the grid, and all there is until the full catalogue loads.
    const curated = offeredAssets('emoji');
    if (!emojiCatalog.data) return curated.map(assetItem);
    const all = emojiCatalog.data.flatMap((g) => g.emoji);
    // The catalogue entries of the curated set carry their skin tones; keep its order.
    const byId = new Map(all.map((e) => [e.id, e]));
    const curatedIds = new Set(curated.map((a) => a.id));
    const first = curated.flatMap((a) => byId.get(a.id) ?? []);
    const rest = all.filter((e) => !curatedIds.has(e.id));
    return [...first, ...rest].map((e) => assetItem(withTone(e, emojiTone)));
  }, [emojiCatalog.data, emojiTone]);

  return useMemo(() => {
    const categories: CatalogCategory[] = [];
    const push = (c: Omit<CatalogCategory, 'tint' | 'cover'> & { cover?: ReactNode }) =>
      categories.push({
        ...c,
        tint: categories.length % 2 === 0 ? 'primary' : 'secondary',
        cover: c.cover ?? cover(c.items),
      });

    if (markeItems.length > 0)
      push({
        id: 'marke',
        label: 'Marke',
        count: markeItems.length,
        items: markeItems,
        isLoading: false,
        searchable: true,
      });
    if (blocks && (blockItems.length > 0 || blocks.isLoading))
      push({
        id: 'bloecke',
        label: blocks.label,
        count: blockItems.length || null,
        items: blockItems,
        isLoading: blocks.isLoading,
        searchable: true,
      });
    if (hasAssets)
      push({
        id: 'sticker',
        label: t.sidebar.elements.categories.sticker,
        count: stickerItems.length,
        items: stickerItems,
        isLoading: false,
        searchable: true,
      });
    if (hasPhotos)
      push({
        id: 'fotos',
        label: t.sidebar.elements.categories.photos,
        count: photos.items.length || null,
        items: photos.items,
        isLoading: photos.isLoading,
        searchable: true,
      });
    if (SHOW_GALLERY_BACKGROUNDS && props.onSetBackgroundImage)
      push({
        id: 'hintergruende',
        label: t.sidebar.elements.categories.backgrounds,
        count: null,
        items: [],
        isLoading: false,
        searchable: false,
        cover: <BackgroundCover />,
      });
    if (props.onAddShape)
      push({
        id: 'formen',
        label: t.sidebar.elements.categories.shapes,
        count: SHAPE_ITEMS.length,
        items: SHAPE_ITEMS,
        isLoading: false,
        searchable: true,
      });
    if (props.onAddChart)
      push({
        id: 'diagramme',
        label: t.sidebar.elements.categories.charts,
        count: CHART_ITEMS.length,
        items: CHART_ITEMS,
        isLoading: false,
        searchable: true,
      });
    if (props.onAddFrame)
      push({
        id: 'rahmen',
        label: t.sidebar.elements.categories.frames,
        count: FRAME_ITEMS.length,
        items: FRAME_ITEMS,
        isLoading: false,
        searchable: true,
      });
    if (hasIllustrations)
      push({
        id: 'illustrationen',
        label: t.sidebar.elements.categories.illustrations,
        count: allIllustrations.data?.length ?? null,
        items: illustrationItems,
        isLoading: allIllustrations.isLoading,
        searchable: true,
        cover: cover(featuredIllustrations),
      });
    if (hasIcons)
      push({
        id: 'icons',
        label: t.sidebar.elements.categories.icons,
        count: iconItems.length || null,
        items: iconItems,
        isLoading: iconsLoading,
        searchable: true,
      });
    if (hasAssets)
      push({
        id: 'emoji',
        label: t.sidebar.elements.categories.emoji,
        count: emojiCatalog.data ? emojiItems.length : null,
        items: emojiItems,
        isLoading: emojiCatalog.isLoading,
        searchable: true,
      });
    return categories;
  }, [
    t,
    markeItems,
    blocks,
    blockItems,
    stickerItems,
    hasAssets,
    hasPhotos,
    photos.items,
    photos.isLoading,
    props.onSetBackgroundImage,
    props.onAddShape,
    props.onAddChart,
    props.onAddFrame,
    hasIllustrations,
    allIllustrations.data,
    allIllustrations.isLoading,
    illustrationItems,
    featuredIllustrations,
    hasIcons,
    iconItems,
    iconsLoading,
    emojiCatalog.data,
    emojiCatalog.isLoading,
    emojiItems,
  ]);
}
