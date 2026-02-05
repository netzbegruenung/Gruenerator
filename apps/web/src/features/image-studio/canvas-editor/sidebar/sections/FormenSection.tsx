import React from 'react';
import { PiStarFill, PiHeartFill, PiCloudFill, PiArrowRightBold, PiTagFill } from 'react-icons/pi';

import { type ShapeType } from '../../utils/shapes';
import './FormenSection.css';

export interface FormenSectionProps {
  onAddShape: (type: ShapeType) => void;
  isExpanded?: boolean;
  onAddPillBadge?: (preset?: string) => void;
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
    renderPreview: () => <div className="formen-preview formen-preview--rect" />,
  },
  {
    id: 'circle',
    title: 'Kreis hinzufügen',
    renderPreview: () => <div className="formen-preview formen-preview--circle" />,
  },
  {
    id: 'triangle',
    title: 'Dreieck hinzufügen',
    renderPreview: () => <div className="formen-preview formen-preview--triangle" />,
  },
  { id: 'arrow', title: 'Pfeil hinzufügen', renderPreview: () => <PiArrowRightBold size={24} /> },
  { id: 'star', title: 'Stern hinzufügen', renderPreview: () => <PiStarFill size={24} /> },
  { id: 'heart', title: 'Herz hinzufügen', renderPreview: () => <PiHeartFill size={24} /> },
  { id: 'cloud', title: 'Wolke hinzufügen', renderPreview: () => <PiCloudFill size={24} /> },
];

export function FormenSection({
  onAddShape,
  isExpanded = false,
  onAddPillBadge,
}: FormenSectionProps) {
  const visibleShapes = isExpanded ? SHAPES : SHAPES.slice(0, 4);

  return (
    <div className="sidebar-section sidebar-section--formen">
      <div className="sidebar-card-grid">
        {visibleShapes.map((shape) => (
          <button
            key={shape.id}
            className="sidebar-selectable-card"
            onClick={() => onAddShape(shape.id)}
            title={shape.title}
          >
            <div className="sidebar-selectable-card__preview">{shape.renderPreview()}</div>
          </button>
        ))}

        {onAddPillBadge && (
          <button
            key="pill-badge"
            className="sidebar-selectable-card"
            onClick={() => onAddPillBadge()}
            title="Pillen-Badge hinzufügen"
          >
            <div className="sidebar-selectable-card__preview">
              <PiTagFill size={24} />
            </div>
          </button>
        )}
      </div>
    </div>
  );
}
