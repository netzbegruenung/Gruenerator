import React from 'react';
import { FaTrash } from 'react-icons/fa';
import { PiStarFill, PiHeartFill, PiCloudFill, PiArrowRightBold } from 'react-icons/pi';
import { BRAND_COLORS, ShapeInstance, ShapeType, createShape } from '../../utils/shapes';
import './FormenSection.css';

export interface FormenSectionProps {
    onAddShape: (type: ShapeType) => void;
    selectedShape: ShapeInstance | null;
    onUpdateShape: (id: string, partial: Partial<ShapeInstance>) => void;
    onRemoveShape: (id: string) => void;
}

export function FormenSection({
    onAddShape,
    selectedShape,
    onUpdateShape,
    onRemoveShape
}: FormenSectionProps) {
    return (
        <div className="sidebar-section sidebar-section--formen">
            <div className="sidebar-card-grid">
                <button
                    className="sidebar-selectable-card"
                    onClick={() => onAddShape('rect')}
                    title="Rechteck hinzufügen"
                >
                    <div className="sidebar-selectable-card__preview">
                        <div className="formen-preview formen-preview--rect" />
                    </div>
                </button>

                <button
                    className="sidebar-selectable-card"
                    onClick={() => onAddShape('circle')}
                    title="Kreis hinzufügen"
                >
                    <div className="sidebar-selectable-card__preview">
                        <div className="formen-preview formen-preview--circle" />
                    </div>
                </button>

                <button
                    className="sidebar-selectable-card"
                    onClick={() => onAddShape('triangle')}
                    title="Dreieck hinzufügen"
                >
                    <div className="sidebar-selectable-card__preview">
                        <div className="formen-preview formen-preview--triangle" />
                    </div>
                </button>

                <button
                    className="sidebar-selectable-card"
                    onClick={() => onAddShape('arrow')}
                    title="Pfeil hinzufügen"
                >
                    <div className="sidebar-selectable-card__preview">
                        <PiArrowRightBold size={24} />
                    </div>
                </button>

                <button
                    className="sidebar-selectable-card"
                    onClick={() => onAddShape('star')}
                    title="Stern hinzufügen"
                >
                    <div className="sidebar-selectable-card__preview">
                        <PiStarFill size={24} />
                    </div>
                </button>

                <button
                    className="sidebar-selectable-card"
                    onClick={() => onAddShape('heart')}
                    title="Herz hinzufügen"
                >
                    <div className="sidebar-selectable-card__preview">
                        <PiHeartFill size={24} />
                    </div>
                </button>

                <button
                    className="sidebar-selectable-card"
                    onClick={() => onAddShape('cloud')}
                    title="Wolke hinzufügen"
                >
                    <div className="sidebar-selectable-card__preview">
                        <PiCloudFill size={24} />
                    </div>
                </button>
            </div>

            {selectedShape && (
                <div className="formen-settings">
                    <div className="sidebar-section-header">
                        <span className="sidebar-section-title">Form bearbeiten</span>
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
