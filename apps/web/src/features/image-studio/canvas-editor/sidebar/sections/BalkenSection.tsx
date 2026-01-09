import { FaTrash, FaCopy } from 'react-icons/fa';
import { COLOR_SCHEMES } from '../../utils/dreizeilenLayout';
import type { BalkenInstance, BalkenMode } from '../../primitives';
import './BalkenSection.css';
import '../../../../../assets/styles/components/form/form-inputs.css';

export interface BalkenSectionProps {
    onAddBalken: (mode: BalkenMode) => void;
    selectedBalken: BalkenInstance | null;
    onUpdateBalken: (id: string, partial: Partial<BalkenInstance>) => void;
    onRemoveBalken: (id: string) => void;
    onDuplicateBalken?: (id: string) => void;
}

export function BalkenSection({
    onAddBalken,
    selectedBalken,
    onUpdateBalken,
    onRemoveBalken,
    onDuplicateBalken,
}: BalkenSectionProps) {

    return (
        <div className="sidebar-section sidebar-section--balken">
            {/* Add buttons */}
            <div className="balken-preview-buttons">
                <button
                    type="button"
                    className="balken-preview-btn"
                    onClick={() => onAddBalken('single')}
                    title="Neuen einzelnen Balken hinzufügen"
                >
                    <div className="balken-preview-icon balken-preview-icon--single">
                        <div className="balken-bar-preview" />
                    </div>
                    <span>1 Balken +</span>
                </button>
                <button
                    type="button"
                    className="balken-preview-btn"
                    onClick={() => onAddBalken('triple')}
                    title="Neue 3er-Balkengruppe hinzufügen"
                >
                    <div className="balken-preview-icon balken-preview-icon--triple">
                        <div className="balken-bar-preview" />
                        <div className="balken-bar-preview" />
                        <div className="balken-bar-preview" />
                    </div>
                    <span>3 Balken +</span>
                </button>
            </div>

            {/* Settings shown only when a balken is selected */}
            {selectedBalken && (
                <div className="balken-settings">
                    <div className="sidebar-section-header">
                        <span className="sidebar-section-title">Ausgewählter Balken</span>
                        {onDuplicateBalken && (
                            <button
                                className="sidebar-action-btn"
                                onClick={() => onDuplicateBalken(selectedBalken.id)}
                                title="Balken duplizieren"
                            >
                                <FaCopy size={12} />
                            </button>
                        )}
                        <button
                            className="sidebar-action-btn sidebar-action-btn--danger"
                            onClick={() => onRemoveBalken(selectedBalken.id)}
                            title="Balken entfernen"
                        >
                            <FaTrash size={12} />
                        </button>
                    </div>

                    {/* Color scheme row */}
                    <div className="balken-color-row">
                        {COLOR_SCHEMES.map((scheme) => (
                            <button
                                key={scheme.id}
                                type="button"
                                className={`balken-color-btn ${selectedBalken.colorSchemeId === scheme.id ? 'balken-color-btn--active' : ''}`}
                                onClick={() => onUpdateBalken(selectedBalken.id, { colorSchemeId: scheme.id })}
                                title={scheme.label}
                            >
                                <div className="balken-color-preview">
                                    {scheme.colors.slice(0, 3).map((color, i) => (
                                        <div
                                            key={i}
                                            className="balken-color-swatch"
                                            style={{ backgroundColor: color.background }}
                                        />
                                    ))}
                                </div>
                            </button>
                        ))}
                    </div>

                    {/* Width slider */}
                    <div className="balken-width-row">
                        <span className="balken-width-label">Breite</span>
                        <input
                            type="range"
                            min={0.5}
                            max={2.0}
                            step={0.1}
                            value={selectedBalken.widthScale}
                            onChange={(e) => onUpdateBalken(selectedBalken.id, { widthScale: parseFloat(e.target.value) })}
                            className="balken-width-slider"
                        />
                        <span className="balken-width-value">{Math.round(selectedBalken.widthScale * 100)}%</span>
                    </div>
                </div>
            )}

        </div>
    );
}
