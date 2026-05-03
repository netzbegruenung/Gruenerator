import { useMemo } from 'react';
import {
  PiStarFill,
  PiHeartFill,
  PiCloudFill,
  PiArrowRightBold,
  PiHexagonFill,
  PiDiamondFill,
  PiCaretRightBold,
  PiArrowsLeftRightBold,
  PiChatCircleFill,
  PiChatCenteredFill,
  PiSparkleFill,
  PiCheckBold,
  PiLeafFill,
} from 'react-icons/pi';

import { ALL_SHAPES, type ShapeType } from '../../utils/shapes';
import { CARD_GRID, CARD_PREVIEW, SELECTABLE_CARD, SIDEBAR_SECTION } from '../primitives';

import { cn } from '../../utils/cn';

export interface FormenSectionProps {
  onAddShape: (type: ShapeType) => void;
  isExpanded?: boolean;
  searchQuery?: string;
}

interface ShapeDefinition {
  id: ShapeType;
  title: string;
  renderPreview: () => React.ReactNode;
}

const SHAPE_DEF_MAP = new Map(ALL_SHAPES.map((s) => [s.id, s]));

const PreviewSvg = ({
  children,
  viewBox = '0 0 100 100',
}: {
  children: React.ReactNode;
  viewBox?: string;
}) => (
  <svg
    width={32}
    height={32}
    viewBox={viewBox}
    fill="var(--font-color)"
    aria-hidden="true"
    className="shrink-0"
  >
    {children}
  </svg>
);

const SHAPES: ShapeDefinition[] = [
  {
    id: 'rect',
    title: 'Rechteck hinzufügen',
    renderPreview: () => <div className="w-[32px] h-[32px] bg-[var(--font-color)] shrink-0" />,
  },
  {
    id: 'rounded-rect',
    title: 'Abgerundetes Rechteck hinzufügen',
    renderPreview: () => (
      <div className="w-[32px] h-[32px] bg-[var(--font-color)] shrink-0 rounded-[8px]" />
    ),
  },
  {
    id: 'circle',
    title: 'Kreis hinzufügen',
    renderPreview: () => (
      <div className="w-[32px] h-[32px] bg-[var(--font-color)] shrink-0 rounded-full" />
    ),
  },
  {
    id: 'ellipse',
    title: 'Ellipse hinzufügen',
    renderPreview: () => (
      <div className="w-[32px] h-[20px] bg-[var(--font-color)] shrink-0 rounded-full" />
    ),
  },
  {
    id: 'ring',
    title: 'Ring hinzufügen',
    renderPreview: () => (
      <div className="w-[32px] h-[32px] shrink-0 rounded-full border-[6px] border-[var(--font-color)]" />
    ),
  },
  {
    id: 'triangle',
    title: 'Dreieck hinzufügen',
    renderPreview: () => (
      <div
        className="w-0 h-0 shrink-0"
        style={{
          borderLeft: '16px solid transparent',
          borderRight: '16px solid transparent',
          borderBottom: '32px solid var(--font-color)',
        }}
      />
    ),
  },
  {
    id: 'diamond',
    title: 'Raute hinzufügen',
    renderPreview: () => <PiDiamondFill size={32} />,
  },
  {
    id: 'pentagon',
    title: 'Fünfeck hinzufügen',
    renderPreview: () => (
      <PreviewSvg>
        <polygon points="50,5 95,38 78,90 22,90 5,38" />
      </PreviewSvg>
    ),
  },
  {
    id: 'hexagon',
    title: 'Sechseck hinzufügen',
    renderPreview: () => <PiHexagonFill size={32} />,
  },
  {
    id: 'arrow',
    title: 'Pfeil hinzufügen',
    renderPreview: () => <PiArrowRightBold size={32} />,
  },
  {
    id: 'chevron',
    title: 'Chevron hinzufügen',
    renderPreview: () => <PiCaretRightBold size={32} />,
  },
  {
    id: 'double-arrow',
    title: 'Doppelpfeil hinzufügen',
    renderPreview: () => <PiArrowsLeftRightBold size={32} />,
  },
  {
    id: 'wavy',
    title: 'Wellenlinie hinzufügen',
    renderPreview: () => (
      <PreviewSvg viewBox="0 0 100 40">
        <path
          d="M0,20 C12,4 28,36 50,20 C72,4 88,36 100,20 L100,28 C88,44 72,12 50,28 C28,44 12,12 0,28 Z"
          fill="var(--font-color)"
        />
      </PreviewSvg>
    ),
  },
  {
    id: 'star',
    title: 'Stern hinzufügen',
    renderPreview: () => <PiStarFill size={32} />,
  },
  {
    id: 'sparkle',
    title: 'Funkeln hinzufügen',
    renderPreview: () => <PiSparkleFill size={32} />,
  },
  {
    id: 'heart',
    title: 'Herz hinzufügen',
    renderPreview: () => <PiHeartFill size={32} />,
  },
  {
    id: 'speech-round',
    title: 'Sprechblase hinzufügen',
    renderPreview: () => <PiChatCircleFill size={32} />,
  },
  {
    id: 'speech-rect',
    title: 'Eckige Sprechblase hinzufügen',
    renderPreview: () => <PiChatCenteredFill size={32} />,
  },
  {
    id: 'cloud',
    title: 'Wolke hinzufügen',
    renderPreview: () => <PiCloudFill size={32} />,
  },
  {
    id: 'leaf',
    title: 'Blatt hinzufügen',
    renderPreview: () => <PiLeafFill size={32} />,
  },
  {
    id: 'blob',
    title: 'Blob hinzufügen',
    renderPreview: () => (
      <PreviewSvg>
        <path d="M50,4 C72,6 90,22 94,44 C98,66 88,86 70,93 C52,100 30,96 18,82 C6,68 4,46 14,28 C24,10 38,2 50,4 Z" />
      </PreviewSvg>
    ),
  },
  {
    id: 'checkmark',
    title: 'Häkchen hinzufügen',
    renderPreview: () => <PiCheckBold size={32} />,
  },
];

const COLLAPSED_COUNT = 6;

export function FormenSection({
  onAddShape,
  isExpanded = false,
  searchQuery = '',
}: FormenSectionProps) {
  const visibleShapes = useMemo(() => {
    const base = isExpanded ? SHAPES : SHAPES.slice(0, COLLAPSED_COUNT);
    if (!searchQuery.trim()) return base;
    const q = searchQuery.toLowerCase();
    return base.filter((shape) => {
      const shapeDef = SHAPE_DEF_MAP.get(shape.id);
      if (!shapeDef) return false;
      return (
        shapeDef.name.toLowerCase().includes(q) ||
        shapeDef.tags.some((tag) => tag.toLowerCase().includes(q))
      );
    });
  }, [isExpanded, searchQuery]);

  return (
    <div className={cn(SIDEBAR_SECTION, 'gap-md max-canvas-mobile:!p-0 max-canvas-mobile:!m-0')}>
      <div className={CARD_GRID}>
        {visibleShapes.map((shape) => (
          <button
            key={shape.id}
            className={SELECTABLE_CARD}
            onClick={() => onAddShape(shape.id)}
            title={shape.title}
          >
            <div className={CARD_PREVIEW}>{shape.renderPreview()}</div>
          </button>
        ))}
      </div>
    </div>
  );
}
