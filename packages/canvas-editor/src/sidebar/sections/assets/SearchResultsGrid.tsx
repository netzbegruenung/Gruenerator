import { FaCheck } from 'react-icons/fa';
import {
  PiArrowRightBold,
  PiArrowsLeftRightBold,
  PiArrowUUpRightBold,
  PiAsteriskBold,
  PiCaretRightBold,
  PiChatCenteredFill,
  PiChatCircleFill,
  PiChatTeardropFill,
  PiCheckBold,
  PiCloudFill,
  PiDiamondFill,
  PiDropFill,
  PiFireFill,
  PiFlagFill,
  PiFlowerFill,
  PiFlowerLotusFill,
  PiGearFill,
  PiGearSixFill,
  PiHeartBreakFill,
  PiHeartFill,
  PiHexagonFill,
  PiLeafFill,
  PiMagnifyingGlass,
  PiMapPinFill,
  PiMinusBold,
  PiMountainsFill,
  PiPlusBold,
  PiScrollFill,
  PiSparkleFill,
  PiStarFill,
  PiStarFourFill,
  PiSunFill,
  PiTagFill,
  PiTreeFill,
  PiXBold,
} from 'react-icons/pi';
import { Icon } from '@iconify/react';

import { useCanvasEditorServices } from '../../../CanvasEditorProvider';
import { FRAME_ICON_MAP } from '../../../utils/frameUtils';
import {
  getIllustrationPath,
  getIllustrationThumbPath,
} from '../../../utils/illustrations/registry';
import { assertNever } from '../../../utils/shapes';
import { CARD_GRID, SELECTABLE_CARD } from '../../primitives';

import { PREVIEW_COMPONENTS } from './constants';

import type React from 'react';
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
              <div className="flex items-center justify-center w-full h-full relative text-secondary-600 dark:text-secondary-300">
                <ShapeSearchPreview type={shape.id} />
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

// --- Shape preview (used inside search results) ---

function ShapeSearchPreview({ type }: { type: ShapeType }): React.ReactElement {
  switch (type) {
    case 'rect':
      return <div className="w-6 h-6 bg-current shrink-0" />;
    case 'rounded-rect':
      return <div className="w-6 h-6 bg-current rounded-md shrink-0" />;
    case 'circle':
      return <div className="w-6 h-6 bg-current rounded-full shrink-0" />;
    case 'ellipse':
      return <div className="w-6 h-4 bg-current rounded-full shrink-0" />;
    case 'ring':
      return <div className="w-6 h-6 rounded-full border-[5px] border-current shrink-0" />;
    case 'triangle':
      return (
        <div
          className="w-0 h-0 shrink-0"
          style={{
            borderLeft: '12px solid transparent',
            borderRight: '12px solid transparent',
            borderBottom: '20px solid currentColor',
          }}
        />
      );
    case 'diamond':
      return <PiDiamondFill size={24} />;
    case 'pentagon':
      return (
        <svg width={24} height={24} viewBox="0 0 100 100" aria-hidden="true">
          <polygon points="50,5 95,38 78,90 22,90 5,38" fill="currentColor" />
        </svg>
      );
    case 'hexagon':
      return <PiHexagonFill size={24} />;
    case 'star':
      return <PiStarFill size={24} />;
    case 'sparkle':
      return <PiSparkleFill size={24} />;
    case 'arrow':
      return <PiArrowRightBold size={24} />;
    case 'chevron':
      return <PiCaretRightBold size={24} />;
    case 'double-arrow':
      return <PiArrowsLeftRightBold size={24} />;
    case 'wavy':
      return (
        <svg width={28} height={14} viewBox="0 0 100 40" aria-hidden="true">
          <path
            d="M0,20 C12,4 28,36 50,20 C72,4 88,36 100,20 L100,28 C88,44 72,12 50,28 C28,44 12,12 0,28 Z"
            fill="currentColor"
          />
        </svg>
      );
    case 'heart':
      return <PiHeartFill size={24} />;
    case 'speech-round':
      return <PiChatCircleFill size={24} />;
    case 'speech-rect':
      return <PiChatCenteredFill size={24} />;
    case 'cloud':
      return <PiCloudFill size={24} />;
    case 'leaf':
      return <PiLeafFill size={24} />;
    case 'blob':
      return (
        <svg width={24} height={24} viewBox="0 0 100 100" aria-hidden="true">
          <path
            d="M50,4 C72,6 90,22 94,44 C98,66 88,86 70,93 C52,100 30,96 18,82 C6,68 4,46 14,28 C24,10 38,2 50,4 Z"
            fill="currentColor"
          />
        </svg>
      );
    case 'checkmark':
      return <PiCheckBold size={24} />;
    case 'line':
      return (
        <svg width={26} height={10} viewBox="0 0 100 10" aria-hidden="true">
          <line x1="2" y1="5" x2="98" y2="5" stroke="currentColor" strokeWidth="5" strokeLinecap="round" />
        </svg>
      );
    case 'line-thick':
      return (
        <svg width={26} height={14} viewBox="0 0 100 14" aria-hidden="true">
          <line x1="2" y1="7" x2="98" y2="7" stroke="currentColor" strokeWidth="12" strokeLinecap="round" />
        </svg>
      );
    case 'line-dashed':
      return (
        <svg width={26} height={10} viewBox="0 0 100 10" aria-hidden="true">
          <line
            x1="2"
            y1="5"
            x2="98"
            y2="5"
            stroke="currentColor"
            strokeWidth="5"
            strokeDasharray="14 8"
          />
        </svg>
      );
    case 'line-dotted':
      return (
        <svg width={26} height={10} viewBox="0 0 100 10" aria-hidden="true">
          <line
            x1="4"
            y1="5"
            x2="96"
            y2="5"
            stroke="currentColor"
            strokeWidth="5"
            strokeLinecap="round"
            strokeDasharray="0 14"
          />
        </svg>
      );
    case 'line-double':
      return (
        <svg width={26} height={14} viewBox="0 0 100 14" aria-hidden="true">
          <line x1="2" y1="4" x2="98" y2="4" stroke="currentColor" strokeWidth="2.5" />
          <line x1="2" y1="10" x2="98" y2="10" stroke="currentColor" strokeWidth="2.5" />
        </svg>
      );
    case 'line-arrow':
      return (
        <svg width={26} height={12} viewBox="0 0 100 12" aria-hidden="true">
          <line x1="2" y1="6" x2="78" y2="6" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
          <polygon points="78,1 98,6 78,11" fill="currentColor" />
        </svg>
      );
    case 'asterisk':
      return <PiAsteriskBold size={24} />;
    case 'speech-cloud':
      return <PiChatTeardropFill size={24} />;
    case 'speech-pointed':
      return (
        <svg width={24} height={24} viewBox="0 0 100 100" aria-hidden="true">
          <path
            d="M5,8 L95,8 L95,68 L60,68 L72,90 L40,68 L5,68 Z"
            fill="currentColor"
          />
        </svg>
      );
    case 'cloud-fluffy':
      return (
        <svg width={24} height={24} viewBox="0 0 100 100" aria-hidden="true">
          <path
            d="M30,55 C20,55 12,48 14,38 C16,28 28,26 34,32 C36,20 52,16 62,28 C68,20 82,22 84,36 C92,38 94,50 86,56 C92,62 88,72 78,70 C72,76 60,76 56,70 C46,76 36,76 32,70 C24,76 16,70 22,62 C14,62 18,55 30,55 Z"
            fill="currentColor"
          />
        </svg>
      );
    case 'heart-broken':
      return <PiHeartBreakFill size={24} />;
    case 'heart-double':
      return (
        <svg width={28} height={20} viewBox="0 0 100 70" aria-hidden="true">
          <path
            d="M28,62 C28,62 4,48 4,22 C4,2 22,-8 30,10 C38,-8 56,2 56,22 C56,48 28,62 28,62 Z M68,62 C68,62 44,48 44,22 C44,2 62,-8 70,10 C78,-8 96,2 96,22 C96,48 68,62 68,62 Z"
            fill="currentColor"
          />
        </svg>
      );
    case 'drop':
      return <PiDropFill size={24} />;
    case 'banner-ribbon':
      return (
        <svg width={28} height={14} viewBox="0 0 100 40" aria-hidden="true">
          <path d="M5,12 L75,12 L95,20 L75,28 L5,28 L20,20 Z" fill="currentColor" />
        </svg>
      );
    case 'banner-flag':
      return <PiFlagFill size={24} />;
    case 'gear':
      return <PiGearFill size={24} />;
    case 'flower':
      return <PiFlowerFill size={24} />;
    case 'plus':
      return <PiPlusBold size={24} />;
    case 'minus':
      return <PiMinusBold size={24} />;
    case 'x-mark':
      return <PiXBold size={24} />;
    case 'arrow-curved':
      return <PiArrowUUpRightBold size={24} />;
    case 'star-burst':
      return <PiStarFourFill size={24} />;
    case 'cloud-puff':
      return (
        <svg width={24} height={24} viewBox="0 0 100 100" aria-hidden="true">
          <path
            d="M22,60 C8,60 5,45 18,38 C18,22 38,18 48,30 C58,18 78,22 78,40 C92,40 92,58 78,62 C78,72 60,72 56,66 C50,72 30,72 22,60 Z"
            fill="currentColor"
          />
        </svg>
      );
    case 'cloud-thin':
      return (
        <svg width={28} height={14} viewBox="0 0 100 50" aria-hidden="true">
          <path
            d="M5,28 C5,15 22,8 32,18 C36,8 50,6 58,16 C72,8 88,16 90,28 C95,30 95,38 85,38 L15,38 C5,38 5,30 5,28 Z"
            fill="currentColor"
          />
        </svg>
      );
    case 'heart-arrow':
      return (
        <svg width={24} height={24} viewBox="0 0 100 100" aria-hidden="true">
          <path
            d="M50,90 C50,90 12,68 12,38 C12,15 30,5 50,28 C70,5 88,15 88,38 C88,68 50,90 50,90 Z M0,46 L20,46 L20,38 L32,52 L20,66 L20,58 L0,58 Z M68,52 L80,52 L80,44 L100,58 L80,72 L80,64 L68,64 Z"
            fill="currentColor"
          />
        </svg>
      );
    case 'drop-pin':
      return <PiMapPinFill size={24} />;
    case 'drop-tear':
      return (
        <svg width={20} height={24} viewBox="0 0 100 100" aria-hidden="true">
          <path
            d="M50,8 C42,28 28,52 32,70 C34,82 42,90 50,90 C58,90 66,82 68,70 C72,52 58,28 50,8 Z"
            fill="currentColor"
          />
        </svg>
      );
    case 'drop-flame':
      return <PiFireFill size={24} />;
    case 'banner-tag':
      return <PiTagFill size={24} />;
    case 'banner-scroll':
      return <PiScrollFill size={24} />;
    case 'gear-12':
      return <PiGearSixFill size={24} />;
    case 'gear-6':
      return (
        <svg width={24} height={24} viewBox="0 0 100 100" aria-hidden="true">
          <polygon
            points="50,5 65,18 85,15 82,35 95,50 82,65 85,85 65,82 50,95 35,82 15,85 18,65 5,50 18,35 15,15 35,18"
            fill="currentColor"
          />
        </svg>
      );
    case 'gear-fine':
      return (
        <svg width={24} height={24} viewBox="0 0 100 100" aria-hidden="true">
          <circle cx="50" cy="50" r="40" fill="currentColor" />
        </svg>
      );
    case 'flower-8':
      return <PiFlowerLotusFill size={24} />;
    case 'blob-2':
      return (
        <svg width={24} height={24} viewBox="0 0 100 100" aria-hidden="true">
          <path
            d="M52,6 C75,12 95,28 92,52 C90,72 75,90 52,92 C32,93 12,82 8,62 C4,42 18,18 30,12 C38,8 45,5 52,6 Z"
            fill="currentColor"
          />
        </svg>
      );
    case 'tree':
      return <PiTreeFill size={24} />;
    case 'mountain':
      return <PiMountainsFill size={24} />;
    case 'sun':
      return <PiSunFill size={24} />;
    default:
      return assertNever(type);
  }
}
