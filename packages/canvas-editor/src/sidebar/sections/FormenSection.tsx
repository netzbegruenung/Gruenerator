import { useMemo } from 'react';
import { PiStarFill, PiHeartFill, PiCloudFill, PiArrowRightBold } from 'react-icons/pi';

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

const SHAPES: ShapeDefinition[] = [
  {
    id: 'rect',
    title: 'Rechteck hinzufügen',
    renderPreview: () => <div className="w-[32px] h-[32px] bg-[var(--font-color)] shrink-0" />,
  },
  {
    id: 'circle',
    title: 'Kreis hinzufügen',
    renderPreview: () => (
      <div className="w-[32px] h-[32px] bg-[var(--font-color)] shrink-0 rounded-full" />
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
  { id: 'arrow', title: 'Pfeil hinzufügen', renderPreview: () => <PiArrowRightBold size={32} /> },
  { id: 'star', title: 'Stern hinzufügen', renderPreview: () => <PiStarFill size={32} /> },
  { id: 'heart', title: 'Herz hinzufügen', renderPreview: () => <PiHeartFill size={32} /> },
  { id: 'cloud', title: 'Wolke hinzufügen', renderPreview: () => <PiCloudFill size={32} /> },
];

export function FormenSection({
  onAddShape,
  isExpanded = false,
  searchQuery = '',
}: FormenSectionProps) {
  const visibleShapes = useMemo(() => {
    const base = isExpanded ? SHAPES : SHAPES.slice(0, 4);
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
