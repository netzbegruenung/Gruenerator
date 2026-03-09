import React from 'react';
import { PiStarFill, PiHeartFill, PiCloudFill, PiArrowRightBold } from 'react-icons/pi';

import { type ShapeType } from '../../utils/shapes';
import { CARD_GRID, CARD_PREVIEW, SELECTABLE_CARD, SIDEBAR_SECTION } from '../primitives';

import { cn } from '@/utils/cn';

export interface FormenSectionProps {
  onAddShape: (type: ShapeType) => void;
  isExpanded?: boolean;
}

interface ShapeDefinition {
  id: ShapeType;
  title: string;
  renderPreview: () => React.ReactNode;
}

const SHAPES: ShapeDefinition[] = [
  {
    id: 'rect',
    title: 'Rechteck hinzufügen',
    renderPreview: () => <div className="w-[24px] h-[24px] bg-[var(--font-color)] shrink-0" />,
  },
  {
    id: 'circle',
    title: 'Kreis hinzufügen',
    renderPreview: () => (
      <div className="w-[24px] h-[24px] bg-[var(--font-color)] shrink-0 rounded-full" />
    ),
  },
  {
    id: 'triangle',
    title: 'Dreieck hinzufügen',
    renderPreview: () => (
      <div
        className="w-0 h-0 shrink-0"
        style={{
          borderLeft: '12px solid transparent',
          borderRight: '12px solid transparent',
          borderBottom: '24px solid var(--font-color)',
        }}
      />
    ),
  },
  { id: 'arrow', title: 'Pfeil hinzufügen', renderPreview: () => <PiArrowRightBold size={24} /> },
  { id: 'star', title: 'Stern hinzufügen', renderPreview: () => <PiStarFill size={24} /> },
  { id: 'heart', title: 'Herz hinzufügen', renderPreview: () => <PiHeartFill size={24} /> },
  { id: 'cloud', title: 'Wolke hinzufügen', renderPreview: () => <PiCloudFill size={24} /> },
];

export function FormenSection({ onAddShape, isExpanded = false }: FormenSectionProps) {
  const visibleShapes = isExpanded ? SHAPES : SHAPES.slice(0, 4);

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
