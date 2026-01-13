import React from 'react';
import { PiStarFill, PiHeartFill, PiCloudFill, PiArrowRightBold } from 'react-icons/pi';
import { ShapeType } from '../../utils/shapes';
import './FormenSection.css';

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
    { id: 'rect', title: 'Rechteck hinzufügen', renderPreview: () => <div className="formen-preview formen-preview--rect" /> },
    { id: 'circle', title: 'Kreis hinzufügen', renderPreview: () => <div className="formen-preview formen-preview--circle" /> },
    { id: 'triangle', title: 'Dreieck hinzufügen', renderPreview: () => <div className="formen-preview formen-preview--triangle" /> },
    { id: 'arrow', title: 'Pfeil hinzufügen', renderPreview: () => <PiArrowRightBold size={24} /> },
    { id: 'star', title: 'Stern hinzufügen', renderPreview: () => <PiStarFill size={24} /> },
    { id: 'heart', title: 'Herz hinzufügen', renderPreview: () => <PiHeartFill size={24} /> },
    { id: 'cloud', title: 'Wolke hinzufügen', renderPreview: () => <PiCloudFill size={24} /> },
];

export function FormenSection({
    onAddShape,
    isExpanded = false,
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
                        <div className="sidebar-selectable-card__preview">
                            {shape.renderPreview()}
                        </div>
                    </button>
                ))}
            </div>
        </div>
    );
}
