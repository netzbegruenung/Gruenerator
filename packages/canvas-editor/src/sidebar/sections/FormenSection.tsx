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

import { EUCALYPTUS, getShapeDef, type ShapeType } from '../../utils/shapes';
import { CARD_GRID, CARD_PREVIEW, SELECTABLE_CARD, SIDEBAR_SECTION } from '../primitives';

import { cn } from '../../utils/cn';

export interface FormenSectionProps {
  onAddShape: (type: ShapeType) => void;
  isExpanded?: boolean;
  searchQuery?: string;
}

interface ShapeDefinition<T extends ShapeType = ShapeType> {
  id: T;
  title: string;
  renderPreview: () => React.ReactNode;
}

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

/**
 * Source of truth for the Formen palette. Typed as `{ [K in ShapeType]: ShapeDefinition<K> }`
 * so adding a new ShapeType without registering a preview is a compile error.
 * Object key insertion order is the palette display order — first COLLAPSED_COUNT entries
 * are visible in the mobile collapsed view.
 */
const SHAPE_PREVIEWS: { readonly [K in ShapeType]: ShapeDefinition<K> } = {
  rect: {
    id: 'rect',
    title: 'Rechteck hinzufügen',
    renderPreview: () => <div className="w-[32px] h-[32px] bg-[var(--font-color)] shrink-0" />,
  },
  'rounded-rect': {
    id: 'rounded-rect',
    title: 'Abgerundetes Rechteck hinzufügen',
    renderPreview: () => (
      <div className="w-[32px] h-[32px] bg-[var(--font-color)] shrink-0 rounded-[8px]" />
    ),
  },
  circle: {
    id: 'circle',
    title: 'Kreis hinzufügen',
    renderPreview: () => (
      <div className="w-[32px] h-[32px] bg-[var(--font-color)] shrink-0 rounded-full" />
    ),
  },
  ellipse: {
    id: 'ellipse',
    title: 'Ellipse hinzufügen',
    renderPreview: () => (
      <div className="w-[32px] h-[20px] bg-[var(--font-color)] shrink-0 rounded-full" />
    ),
  },
  ring: {
    id: 'ring',
    title: 'Ring hinzufügen',
    renderPreview: () => (
      <div className="w-[32px] h-[32px] shrink-0 rounded-full border-[6px] border-[var(--font-color)]" />
    ),
  },
  triangle: {
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
  diamond: {
    id: 'diamond',
    title: 'Raute hinzufügen',
    renderPreview: () => <PiDiamondFill size={32} />,
  },
  pentagon: {
    id: 'pentagon',
    title: 'Fünfeck hinzufügen',
    renderPreview: () => (
      <PreviewSvg>
        <polygon points="50,5 95,38 78,90 22,90 5,38" />
      </PreviewSvg>
    ),
  },
  hexagon: {
    id: 'hexagon',
    title: 'Sechseck hinzufügen',
    renderPreview: () => <PiHexagonFill size={32} />,
  },
  arrow: {
    id: 'arrow',
    title: 'Pfeil hinzufügen',
    renderPreview: () => <PiArrowRightBold size={32} />,
  },
  chevron: {
    id: 'chevron',
    title: 'Chevron hinzufügen',
    renderPreview: () => <PiCaretRightBold size={32} />,
  },
  'double-arrow': {
    id: 'double-arrow',
    title: 'Doppelpfeil hinzufügen',
    renderPreview: () => <PiArrowsLeftRightBold size={32} />,
  },
  wavy: {
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
  line: {
    id: 'line',
    title: 'Linie hinzufügen',
    renderPreview: () => (
      <svg width={32} height={12} viewBox="0 0 100 12" aria-hidden="true" className="shrink-0">
        <line x1="2" y1="6" x2="98" y2="6" stroke={EUCALYPTUS} strokeWidth="6" strokeLinecap="round" />
      </svg>
    ),
  },
  'line-thick': {
    id: 'line-thick',
    title: 'Dicke Linie hinzufügen',
    renderPreview: () => (
      <svg width={32} height={16} viewBox="0 0 100 16" aria-hidden="true" className="shrink-0">
        <line x1="2" y1="8" x2="98" y2="8" stroke={EUCALYPTUS} strokeWidth="14" strokeLinecap="round" />
      </svg>
    ),
  },
  'line-dashed': {
    id: 'line-dashed',
    title: 'Gestrichelte Linie hinzufügen',
    renderPreview: () => (
      <svg width={32} height={12} viewBox="0 0 100 12" aria-hidden="true" className="shrink-0">
        <line
          x1="2"
          y1="6"
          x2="98"
          y2="6"
          stroke={EUCALYPTUS}
          strokeWidth="6"
          strokeLinecap="butt"
          strokeDasharray="14 8"
        />
      </svg>
    ),
  },
  'line-dotted': {
    id: 'line-dotted',
    title: 'Gepunktete Linie hinzufügen',
    renderPreview: () => (
      <svg width={32} height={12} viewBox="0 0 100 12" aria-hidden="true" className="shrink-0">
        <line
          x1="4"
          y1="6"
          x2="96"
          y2="6"
          stroke={EUCALYPTUS}
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray="0 14"
        />
      </svg>
    ),
  },
  'line-double': {
    id: 'line-double',
    title: 'Doppellinie hinzufügen',
    renderPreview: () => (
      <svg width={32} height={16} viewBox="0 0 100 16" aria-hidden="true" className="shrink-0">
        <line x1="2" y1="4" x2="98" y2="4" stroke={EUCALYPTUS} strokeWidth="3" />
        <line x1="2" y1="12" x2="98" y2="12" stroke={EUCALYPTUS} strokeWidth="3" />
      </svg>
    ),
  },
  'line-arrow': {
    id: 'line-arrow',
    title: 'Linie mit Pfeil hinzufügen',
    renderPreview: () => (
      <svg width={32} height={14} viewBox="0 0 100 14" aria-hidden="true" className="shrink-0">
        <line x1="2" y1="7" x2="78" y2="7" stroke={EUCALYPTUS} strokeWidth="5" strokeLinecap="round" />
        <polygon points="78,1 98,7 78,13" fill={EUCALYPTUS} />
      </svg>
    ),
  },
  star: {
    id: 'star',
    title: 'Stern hinzufügen',
    renderPreview: () => <PiStarFill size={32} />,
  },
  sparkle: {
    id: 'sparkle',
    title: 'Funkeln hinzufügen',
    renderPreview: () => <PiSparkleFill size={32} />,
  },
  heart: {
    id: 'heart',
    title: 'Herz hinzufügen',
    renderPreview: () => <PiHeartFill size={32} />,
  },
  'speech-round': {
    id: 'speech-round',
    title: 'Sprechblase hinzufügen',
    renderPreview: () => <PiChatCircleFill size={32} />,
  },
  'speech-rect': {
    id: 'speech-rect',
    title: 'Eckige Sprechblase hinzufügen',
    renderPreview: () => <PiChatCenteredFill size={32} />,
  },
  cloud: {
    id: 'cloud',
    title: 'Wolke hinzufügen',
    renderPreview: () => <PiCloudFill size={32} />,
  },
  leaf: {
    id: 'leaf',
    title: 'Blatt hinzufügen',
    renderPreview: () => <PiLeafFill size={32} />,
  },
  blob: {
    id: 'blob',
    title: 'Blob hinzufügen',
    renderPreview: () => (
      <PreviewSvg>
        <path d="M50,4 C72,6 90,22 94,44 C98,66 88,86 70,93 C52,100 30,96 18,82 C6,68 4,46 14,28 C24,10 38,2 50,4 Z" />
      </PreviewSvg>
    ),
  },
  checkmark: {
    id: 'checkmark',
    title: 'Häkchen hinzufügen',
    renderPreview: () => <PiCheckBold size={32} />,
  },
};

const SHAPES: ReadonlyArray<ShapeDefinition> = Object.values(SHAPE_PREVIEWS);
const COLLAPSED_COUNT = 6;

export function FormenSection({
  onAddShape,
  isExpanded = false,
  searchQuery = '',
}: FormenSectionProps) {
  const visibleShapes = useMemo(() => {
    const base = isExpanded ? SHAPES : SHAPES.slice(0, COLLAPSED_COUNT);
    const q = searchQuery.trim().toLowerCase();
    if (!q) return base;
    return base.filter((shape) => {
      const def = getShapeDef(shape.id);
      return def.name.toLowerCase().includes(q) || def.tags.some((tag) => tag.toLowerCase().includes(q));
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
