import { useCallback, useMemo } from 'react';
import { FaCheck } from 'react-icons/fa';
import { ALL_ICONS } from '../../utils/canvasIcons';
import './IconsSection.css';

export interface IconsSectionProps {
    selectedIcons: string[];
    onIconToggle: (iconId: string, selected: boolean) => void;
    maxSelections?: number;
}

const RECOMMENDED_ICON_IDS = [
    'pi-flowertulip',
    'pi-heartfill',
    'pi-sparklefill',
    'pi-starfill'
];

export function IconsSection({
    selectedIcons,
    onIconToggle,
    maxSelections = 3,
}: IconsSectionProps) {
    // Show recommended icons (no search - unified search is in AssetsSection)
    const icons = useMemo(() => {
        return RECOMMENDED_ICON_IDS.map(id => ALL_ICONS.find(icon => icon.id === id)).filter(Boolean);
    }, []);

    const handleIconClick = useCallback((iconId: string) => {
        const isSelected = selectedIcons.includes(iconId);
        if (isSelected) {
            onIconToggle(iconId, false);
        } else if (selectedIcons.length < maxSelections) {
            onIconToggle(iconId, true);
        }
    }, [selectedIcons, onIconToggle, maxSelections]);

    return (
        <div className="sidebar-section sidebar-section--icons">
            <div className="sidebar-card-grid">
                {icons.map((icon) => {
                    if (!icon) return null;
                    const IconComponent = icon.component;
                    const isSelected = selectedIcons.includes(icon.id);
                    const isDisabled = !isSelected && selectedIcons.length >= maxSelections;

                    return (
                        <button
                            key={icon.id}
                            type="button"
                            className={`sidebar-selectable-card ${isDisabled ? 'sidebar-selectable-card--disabled' : ''}`}
                            onClick={() => handleIconClick(icon.id)}
                            title={icon.name}
                            disabled={isDisabled}
                        >
                            <div className="sidebar-selectable-card__preview">
                                <IconComponent size={24} />
                                {isSelected && (
                                    <span className="sidebar-selectable-card__check sidebar-selectable-card__check--small">
                                        <FaCheck size={8} />
                                    </span>
                                )}
                            </div>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
