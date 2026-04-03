import { FaCheck } from 'react-icons/fa';
import { PiMagnifyingGlass } from 'react-icons/pi';
import { Icon } from '@iconify/react';

import { useCanvasEditorServices } from '../../../CanvasEditorProvider';
import { FRAME_ICON_MAP } from '../../../utils/frameUtils';
import {
  getIllustrationPath,
  getIllustrationThumbPath,
} from '../../../utils/illustrations/registry';
import { CARD_GRID, SELECTABLE_CARD } from '../../primitives';

import { PREVIEW_COMPONENTS } from './constants';

import type { SearchResult } from './useAssetSearch';
import type { FrameClipType } from '../../../utils/frameUtils';
import type { KawaiiDef, SvgDef } from '../../../utils/illustrations/types';
import type { ShapeType } from '../../../utils/shapes';

import { cn } from '../../../utils/cn';

// --- SearchInput ---

export function SearchInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="relative w-full mb-3">
      <PiMagnifyingGlass
        size={16}
        className="absolute left-0 top-1/2 -translate-y-1/2 text-grey-500 pointer-events-none"
      />
      <input
        type="text"
        placeholder={placeholder ?? 'Suche...'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full py-2 pr-0 pl-7 border-0 border-b border-b-grey-200 dark:border-b-grey-700 rounded-none text-[length:var(--font-size-sm,13px)] text-foreground bg-transparent transition-[border-color] duration-200 focus:outline-none focus:border-b-primary-600 placeholder:text-grey-500"
      />
    </div>
  );
}

// --- SearchResultsGrid ---

export interface SearchResultsGridProps {
  results: SearchResult[];
  onAddAsset?: (assetId: string) => void;
  onAddShape?: (type: ShapeType) => void;
  onAddIllustration?: (id: string) => void;
  onAddFrame?: (clipType: FrameClipType) => void;
  selectedIcons?: string[];
  onIconToggle?: (iconId: string, selected: boolean) => void;
  maxIconSelections?: number;
}

export function SearchResultsGrid({
  results,
  onAddAsset,
  onAddShape,
  onAddIllustration,
  onAddFrame,
  selectedIcons = [],
  onIconToggle,
  maxIconSelections = 3,
}: SearchResultsGridProps) {
  const { assetBaseUrl = '' } = useCanvasEditorServices();
  return (
    <div className={CARD_GRID}>
      {results.map((result) => {
        if (result.type === 'element' && result.asset && onAddAsset) {
          const asset = result.asset;
          return (
            <button
              key={`element-${result.id}`}
              className={SELECTABLE_CARD}
              onClick={() => onAddAsset(asset.id)}
              type="button"
              title={`${asset.label} hinzufügen`}
            >
              <div className="flex items-center justify-center w-full h-full relative">
                <img
                  src={asset.src}
                  alt={asset.label}
                  className="w-[60%] h-[60%] max-w-8 max-h-8 object-contain"
                />
              </div>
            </button>
          );
        }

        if (result.type === 'shape' && result.shapeDef && onAddShape) {
          const shape = result.shapeDef;
          return (
            <button
              key={`shape-${result.id}`}
              className={SELECTABLE_CARD}
              onClick={() => onAddShape(shape.id)}
              type="button"
              title={shape.name}
            >
              <div className="flex items-center justify-center w-full h-full relative">
                {shape.id === 'rect' && <div className="formen-preview formen-preview--rect" />}
                {shape.id === 'circle' && <div className="formen-preview formen-preview--circle" />}
                {shape.id === 'triangle' && (
                  <div className="formen-preview formen-preview--triangle" />
                )}
                {['star', 'heart', 'cloud', 'arrow'].includes(shape.id) && (
                  <span style={{ fontSize: 24 }}>
                    {shape.id === 'star' && '★'}
                    {shape.id === 'heart' && '♥'}
                    {shape.id === 'cloud' && '☁'}
                    {shape.id === 'arrow' && '→'}
                  </span>
                )}
              </div>
            </button>
          );
        }

        if (result.type === 'icon' && result.iconDef && onIconToggle) {
          const icon = result.iconDef;
          const isSelected = selectedIcons.includes(icon.id);
          const isDisabled = !isSelected && selectedIcons.length >= maxIconSelections;

          return (
            <button
              key={`icon-${result.id}`}
              className={cn(SELECTABLE_CARD, isDisabled && 'opacity-40 cursor-not-allowed')}
              onClick={() => !isDisabled && onIconToggle(icon.id, !isSelected)}
              type="button"
              title={icon.name}
              disabled={isDisabled}
            >
              <div className="flex items-center justify-center w-full h-full relative">
                <Icon icon={icon.id} width={24} height={24} />
                {isSelected && (
                  <span className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-primary-600 text-white flex items-center justify-center">
                    <FaCheck size={8} />
                  </span>
                )}
              </div>
            </button>
          );
        }

        if (result.type === 'illustration' && result.illustrationDef && onAddIllustration) {
          const ill = result.illustrationDef;
          if (ill.source === 'kawaii') {
            const kDef = ill as KawaiiDef;
            const PreviewComponent = PREVIEW_COMPONENTS[kDef.id];
            return (
              <button
                key={`ill-${result.id}`}
                className={SELECTABLE_CARD}
                onClick={() => onAddIllustration(ill.id)}
                type="button"
                title={ill.name}
              >
                <div className="flex items-center justify-center w-full h-full aspect-square">
                  <PreviewComponent size={32} mood="happy" color="#005437" />
                </div>
              </button>
            );
          } else {
            return (
              <button
                key={`ill-${result.id}`}
                className={SELECTABLE_CARD}
                onClick={() => onAddIllustration(ill.id)}
                type="button"
                title={ill.name}
              >
                <div className="flex items-center justify-center w-full h-full aspect-square [&>img]:max-w-full [&>img]:max-h-full [&>img]:object-contain">
                  <img
                    src={getIllustrationThumbPath(ill as SvgDef, assetBaseUrl)}
                    alt={ill.name}
                    loading="lazy"
                    onError={(e) => {
                      const img = e.currentTarget;
                      if (!img.dataset.fallback) {
                        img.dataset.fallback = '1';
                        img.src = getIllustrationPath(ill as SvgDef, assetBaseUrl);
                      }
                    }}
                  />
                </div>
              </button>
            );
          }
        }

        if (result.type === 'frame' && result.frameClipType && onAddFrame) {
          return (
            <button
              key={`frame-${result.id}`}
              className={SELECTABLE_CARD}
              onClick={() => onAddFrame(result.frameClipType!)}
              type="button"
              title={result.name}
            >
              <div className="flex items-center justify-center w-full h-full relative">
                {(() => {
                  const Icon = FRAME_ICON_MAP[result.frameClipType!];
                  return <Icon size={24} />;
                })()}
              </div>
            </button>
          );
        }

        return null;
      })}
    </div>
  );
}
