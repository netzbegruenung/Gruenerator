import { memo } from 'react';
import { FaCheck } from 'react-icons/fa';
import { Icon } from '@iconify/react';

import { useIconCatalog } from '../../../hooks/useIconCatalog';
import { useCanvasEditorServices } from '../../../CanvasEditorProvider';
import { sortLogoAssets } from '../../../utils/canvasAssets';
import { CHART_TYPE_DEFS } from '../../../utils/chartUtils';
import { FRAME_ICON_MAP, FRAME_PRESETS } from '../../../utils/frameUtils';
import { KAWAII_ILLUSTRATIONS, UNDRAW_FEATURED } from '../../../utils/illustrations/registry';
import { SingleBalkenPreviewIcon, TripleBalkenPreviewIcon } from '../BadgePreviewIcons';
import { ChartTypePreview } from '../DiagrammeSection';
import { ALL_PALETTE_SHAPES, getShapeVariant } from '../FormenSection';
import { IllustrationThumb } from '../IllustrationThumb';

import { StripTile } from './CategoryStrip';
import { PREVIEW_COMPONENTS } from './constants';

import type { BalkenMode } from '../../../primitives';
import type { ChartType } from '../../../utils/chartUtils';
import type { FrameClipType } from '../../../utils/frameUtils';
import type { ShapeType } from '../../../utils/shapes';

import { cn } from '../../../utils/cn';

const STRIP_COUNT = 8;
const NO_RECOMMENDED: string[] = [];

/** Combined brand strip: locale-filtered logos, plus Balken for DE users. */
export const MarkeStripTiles = memo(function MarkeStripTiles({
  onAddAsset,
  onAddBalken,
  recommendedAssetIds = NO_RECOMMENDED,
}: {
  onAddAsset?: (assetId: string) => void;
  onAddBalken?: (mode: BalkenMode) => void;
  recommendedAssetIds?: string[];
}) {
  const { userLocale = 'de-DE' } = useCanvasEditorServices();
  const showBalken = userLocale === 'de-DE' && onAddBalken !== undefined;
  const logos = onAddAsset
    ? sortLogoAssets(recommendedAssetIds, userLocale).slice(
        0,
        showBalken ? STRIP_COUNT - 2 : STRIP_COUNT
      )
    : [];

  return (
    <>
      {logos.map((asset) => {
        const isWhiteAsset = /weiss|white/.test(asset.id);
        return (
          <StripTile
            key={asset.id}
            title={`${asset.label} hinzufügen`}
            onClick={() => onAddAsset!(asset.id)}
            className={cn(isWhiteAsset && 'bg-secondary-600 hover:bg-secondary-700')}
          >
            <img src={asset.src} alt={asset.label} className="w-9 h-9 object-contain" />
          </StripTile>
        );
      })}
      {showBalken && (
        <>
          <StripTile title="Einzelnen Balken hinzufügen" onClick={() => onAddBalken!('single')}>
            <SingleBalkenPreviewIcon size={44} />
          </StripTile>
          <StripTile title="Dreifach-Balken hinzufügen" onClick={() => onAddBalken!('triple')}>
            <TripleBalkenPreviewIcon size={44} />
          </StripTile>
        </>
      )}
    </>
  );
});

export const FormenStripTiles = memo(function FormenStripTiles({
  onAddShape,
}: {
  onAddShape: (type: ShapeType, color?: string) => void;
}) {
  return (
    <>
      {ALL_PALETTE_SHAPES.slice(0, STRIP_COUNT).map((shape) => {
        const variant = getShapeVariant(shape.id);
        return (
          <StripTile
            key={shape.id}
            title={shape.title}
            onClick={() => onAddShape(shape.id, variant.color)}
          >
            <span
              className={cn('inline-flex items-center justify-center', variant.darkPreviewClass)}
              style={{ color: variant.color }}
            >
              {shape.renderPreview()}
            </span>
          </StripTile>
        );
      })}
    </>
  );
});

export const DiagrammeStripTiles = memo(function DiagrammeStripTiles({
  onAddChart,
}: {
  onAddChart: (chartType: ChartType) => void;
}) {
  return (
    <>
      {CHART_TYPE_DEFS.map((def) => (
        <StripTile key={def.id} title={`${def.name} einfügen`} onClick={() => onAddChart(def.id)}>
          <ChartTypePreview type={def.id} size={44} />
        </StripTile>
      ))}
    </>
  );
});

export const RahmenStripTiles = memo(function RahmenStripTiles({
  onAddFrame,
}: {
  onAddFrame: (clipType: FrameClipType) => void;
}) {
  return (
    <>
      {FRAME_PRESETS.slice(0, STRIP_COUNT).map((preset) => {
        const FrameIcon = FRAME_ICON_MAP[preset.id];
        return (
          <StripTile
            key={preset.id}
            title={`${preset.name} hinzufügen`}
            onClick={() => onAddFrame(preset.id)}
          >
            <FrameIcon size={28} className="text-secondary-600 dark:text-secondary-300" />
          </StripTile>
        );
      })}
    </>
  );
});

export const IllustrationStripTiles = memo(function IllustrationStripTiles({
  onAddIllustration,
}: {
  onAddIllustration: (id: string) => void;
}) {
  return (
    <>
      {KAWAII_ILLUSTRATIONS.slice(0, 2).map((def) => {
        const PreviewComponent = PREVIEW_COMPONENTS[def.id];
        return (
          <StripTile key={def.id} title={def.name} onClick={() => onAddIllustration(def.id)}>
            <PreviewComponent size={38} mood="happy" color="#005437" />
          </StripTile>
        );
      })}
      {UNDRAW_FEATURED.slice(0, STRIP_COUNT - 2).map((def) => (
        <StripTile key={def.id} title={def.name} onClick={() => onAddIllustration(def.id)}>
          <IllustrationThumb def={def} className="max-w-[56px] max-h-[46px] object-contain" />
        </StripTile>
      ))}
    </>
  );
});

// Not memoized: the icon catalog arrives via the query below and must re-render
// this component even when props are unchanged.
export function IconStripTiles({
  selectedIcons,
  onIconToggle,
  maxIconSelections = 3,
}: {
  selectedIcons: string[];
  onIconToggle: (iconId: string, selected: boolean) => void;
  maxIconSelections?: number;
}) {
  const { data: icons } = useIconCatalog();

  if (!icons) {
    return (
      <>
        {Array.from({ length: 6 }, (_, i) => (
          <div
            key={i}
            className="w-[78px] h-[60px] flex-none rounded-[10px] bg-[var(--editor-tile)] animate-pulse"
          />
        ))}
      </>
    );
  }

  return (
    <>
      {icons.slice(0, STRIP_COUNT + 2).map((icon) => {
        const isSelected = selectedIcons.includes(icon.id);
        const isDisabled = !isSelected && selectedIcons.length >= maxIconSelections;
        return (
          <StripTile
            key={icon.id}
            title={icon.name}
            disabled={isDisabled}
            selected={isSelected}
            onClick={() => onIconToggle(icon.id, !isSelected)}
          >
            <span className="inline-flex items-center justify-center text-[var(--font-color)]">
              <Icon icon={icon.id} width={26} height={26} />
            </span>
            {isSelected && (
              <span className="absolute top-1 right-1 w-4 h-4 rounded-full bg-primary-600 text-white flex items-center justify-center">
                <FaCheck size={8} />
              </span>
            )}
          </StripTile>
        );
      })}
    </>
  );
}
