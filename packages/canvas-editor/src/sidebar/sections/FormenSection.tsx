import { useMemo } from 'react';
import {
  PiStarFill,
  PiHeartFill,
  PiHeartBreakFill,
  PiCloudFill,
  PiArrowRightBold,
  PiHexagonFill,
  PiDiamondFill,
  PiCaretRightBold,
  PiArrowsLeftRightBold,
  PiChatCircleFill,
  PiChatCenteredFill,
  PiChatTeardropFill,
  PiSparkleFill,
  PiAsteriskBold,
  PiCheckBold,
  PiPlusBold,
  PiLeafFill,
  PiDropFill,
  PiFlagFill,
  PiGearFill,
  PiFlowerFill,
} from 'react-icons/pi';

import {
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  EUCALYPTUS,
  getShapeDef,
  type ShapeCategory,
  type ShapeType,
} from '../../utils/shapes';
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
  width = 32,
  height = 32,
}: {
  children: React.ReactNode;
  viewBox?: string;
  width?: number;
  height?: number;
}) => (
  <svg
    width={width}
    height={height}
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
 * Order is the within-category display order; categories are ordered separately
 * by CATEGORY_ORDER from shapes.ts.
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
  asterisk: {
    id: 'asterisk',
    title: 'Asterisk hinzufügen',
    renderPreview: () => <PiAsteriskBold size={32} />,
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
  'speech-cloud': {
    id: 'speech-cloud',
    title: 'Denkblase hinzufügen',
    renderPreview: () => <PiChatTeardropFill size={32} />,
  },
  'speech-pointed': {
    id: 'speech-pointed',
    title: 'Spitze Sprechblase hinzufügen',
    renderPreview: () => (
      <PreviewSvg>
        <path d="M5,8 L95,8 L95,68 L60,68 L72,90 L40,68 L5,68 Z" />
      </PreviewSvg>
    ),
  },
  cloud: {
    id: 'cloud',
    title: 'Wolke hinzufügen',
    renderPreview: () => <PiCloudFill size={32} />,
  },
  'cloud-fluffy': {
    id: 'cloud-fluffy',
    title: 'Flauschige Wolke hinzufügen',
    renderPreview: () => (
      <PreviewSvg>
        <path d="M30,55 C20,55 12,48 14,38 C16,28 28,26 34,32 C36,20 52,16 62,28 C68,20 82,22 84,36 C92,38 94,50 86,56 C92,62 88,72 78,70 C72,76 60,76 56,70 C46,76 36,76 32,70 C24,76 16,70 22,62 C14,62 18,55 30,55 Z" />
      </PreviewSvg>
    ),
  },
  heart: {
    id: 'heart',
    title: 'Herz hinzufügen',
    renderPreview: () => <PiHeartFill size={32} />,
  },
  'heart-broken': {
    id: 'heart-broken',
    title: 'Gebrochenes Herz hinzufügen',
    renderPreview: () => <PiHeartBreakFill size={32} />,
  },
  'heart-double': {
    id: 'heart-double',
    title: 'Doppeltes Herz hinzufügen',
    renderPreview: () => (
      <PreviewSvg viewBox="0 0 100 70">
        <path d="M28,62 C28,62 4,48 4,22 C4,2 22,-8 30,10 C38,-8 56,2 56,22 C56,48 28,62 28,62 Z M68,62 C68,62 44,48 44,22 C44,2 62,-8 70,10 C78,-8 96,2 96,22 C96,48 68,62 68,62 Z" />
      </PreviewSvg>
    ),
  },
  drop: {
    id: 'drop',
    title: 'Tropfen hinzufügen',
    renderPreview: () => <PiDropFill size={32} />,
  },
  'banner-ribbon': {
    id: 'banner-ribbon',
    title: 'Banner hinzufügen',
    renderPreview: () => (
      <PreviewSvg viewBox="0 0 100 40">
        <path d="M5,12 L75,12 L95,20 L75,28 L5,28 L20,20 Z" />
      </PreviewSvg>
    ),
  },
  'banner-flag': {
    id: 'banner-flag',
    title: 'Wimpel hinzufügen',
    renderPreview: () => <PiFlagFill size={32} />,
  },
  gear: {
    id: 'gear',
    title: 'Zahnrad hinzufügen',
    renderPreview: () => <PiGearFill size={32} />,
  },
  flower: {
    id: 'flower',
    title: 'Blume hinzufügen',
    renderPreview: () => <PiFlowerFill size={32} />,
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
  leaf: {
    id: 'leaf',
    title: 'Blatt hinzufügen',
    renderPreview: () => <PiLeafFill size={32} />,
  },
  checkmark: {
    id: 'checkmark',
    title: 'Häkchen hinzufügen',
    renderPreview: () => <PiCheckBold size={32} />,
  },
  plus: {
    id: 'plus',
    title: 'Plus hinzufügen',
    renderPreview: () => <PiPlusBold size={32} />,
  },
};

const ALL_PALETTE_SHAPES: ReadonlyArray<ShapeDefinition> = Object.values(SHAPE_PREVIEWS);
const COLLAPSED_COUNT = 6;

/** Index of palette entries grouped by category (computed once at module load). */
const SHAPES_BY_CATEGORY: Record<ShapeCategory, ReadonlyArray<ShapeDefinition>> = (() => {
  const acc = {} as Record<ShapeCategory, ShapeDefinition[]>;
  for (const cat of CATEGORY_ORDER) acc[cat] = [];
  for (const shape of ALL_PALETTE_SHAPES) {
    const def = getShapeDef(shape.id);
    acc[def.category].push(shape);
  }
  return acc;
})();

function shapeMatchesQuery(shape: ShapeDefinition, q: string): boolean {
  const def = getShapeDef(shape.id);
  return def.name.toLowerCase().includes(q) || def.tags.some((tag) => tag.toLowerCase().includes(q));
}

export function FormenSection({
  onAddShape,
  isExpanded = false,
  searchQuery = '',
}: FormenSectionProps) {
  const q = searchQuery.trim().toLowerCase();

  // Collapsed (mobile) view: flat first-N grid, no subheaders.
  const collapsedShapes = useMemo(() => {
    const base = ALL_PALETTE_SHAPES.slice(0, COLLAPSED_COUNT);
    return q ? base.filter((s) => shapeMatchesQuery(s, q)) : base;
  }, [q]);

  // Expanded view: grouped by category with subheaders.
  const groupedShapes = useMemo(() => {
    const groups: { category: ShapeCategory; shapes: ReadonlyArray<ShapeDefinition> }[] = [];
    for (const cat of CATEGORY_ORDER) {
      const all = SHAPES_BY_CATEGORY[cat];
      const filtered = q ? all.filter((s) => shapeMatchesQuery(s, q)) : all;
      if (filtered.length > 0) groups.push({ category: cat, shapes: filtered });
    }
    return groups;
  }, [q]);

  const renderShapeButton = (shape: ShapeDefinition) => (
    <button
      key={shape.id}
      className={SELECTABLE_CARD}
      onClick={() => onAddShape(shape.id)}
      title={shape.title}
    >
      <div className={CARD_PREVIEW}>{shape.renderPreview()}</div>
    </button>
  );

  if (!isExpanded) {
    return (
      <div className={cn(SIDEBAR_SECTION, 'gap-md max-canvas-mobile:!p-0 max-canvas-mobile:!m-0')}>
        <div className={CARD_GRID}>{collapsedShapes.map(renderShapeButton)}</div>
      </div>
    );
  }

  return (
    <div className={cn(SIDEBAR_SECTION, 'gap-md max-canvas-mobile:!p-0 max-canvas-mobile:!m-0')}>
      {groupedShapes.map(({ category, shapes }) => (
        <section key={category} className="flex flex-col gap-2">
          <h5 className="text-sm font-bold text-foreground m-0">{CATEGORY_LABELS[category]}</h5>
          <div className={CARD_GRID}>{shapes.map(renderShapeButton)}</div>
        </section>
      ))}
    </div>
  );
}
