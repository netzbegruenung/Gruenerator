import React from 'react';
import { FaTrash, FaCopy } from 'react-icons/fa';
import { PiStarFill, PiHeartFill, PiCloudFill, PiArrowRightBold } from 'react-icons/pi';
import { BRAND_COLORS, ShapeInstance, ShapeType, ALL_SHAPES } from '../../utils/shapes';
import './FormenSection.css';

export interface FormenSectionProps {
    onAddShape: (type: ShapeType) => void;
    selectedShape: ShapeInstance | null;
    onUpdateShape: (id: string, partial: Partial<ShapeInstance>) => void;
    onRemoveShape: (id: string) => void;
    onDuplicateShape?: (id: string) => void;
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
    selectedShape,
    onUpdateShape,
    onRemoveShape,
    onDuplicateShape,
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

            {selectedShape && (
                <div className="formen-settings">
                    <div className="sidebar-section-header">
                        <span className="sidebar-section-title">Form bearbeiten</span>
                        {onDuplicateShape && (
                            <button
                                className="sidebar-action-btn"
                                onClick={() => onDuplicateShape(selectedShape.id)}
                                title="Form duplizieren"
                            >
                                <FaCopy size={12} />
                            </button>
                        )}
                        <button
                            className="sidebar-action-btn sidebar-action-btn--danger"
                            onClick={() => onRemoveShape(selectedShape.id)}
                            title="Form entfernen"
                        >
                            <FaTrash size={12} />
                        </button>
                    </div>

                    <div className="formen-color-grid">
                        {BRAND_COLORS.map(color => (
                            <button
                                key={color.id}
                                className={`formen-color-btn ${selectedShape.fill === color.value ? 'formen-color-btn--active' : ''}`}
                                style={{ backgroundColor: color.value }}
                                onClick={() => onUpdateShape(selectedShape.id, { fill: color.value })}
                                title={color.name}
                            />
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
