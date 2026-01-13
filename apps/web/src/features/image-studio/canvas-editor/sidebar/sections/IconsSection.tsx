import { useCallback, useMemo, useRef, useEffect } from 'react';
import { FaCheck } from 'react-icons/fa';
import { ALL_ICONS } from '../../utils/canvasIcons';
import { usePaginatedIcons } from '../../hooks/usePaginatedIcons';
import Spinner from '../../../../../components/common/Spinner';
import './IconsSection.css';

export interface IconsSectionProps {
    selectedIcons: string[];
    onIconToggle: (iconId: string, selected: boolean) => void;
    maxSelections?: number;
    isExpanded?: boolean;
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
    isExpanded = false,
}: IconsSectionProps) {
    const sentinelRef = useRef<HTMLDivElement>(null);

    const recommendedIcons = useMemo(
        () => RECOMMENDED_ICON_IDS.map(id => ALL_ICONS.find(icon => icon.id === id)).filter(Boolean),
        []
    );

    const { visibleIcons, hasMore, loadMore, totalCount, loadedCount } = usePaginatedIcons(isExpanded);

    const icons = isExpanded ? visibleIcons : recommendedIcons;

    useEffect(() => {
        if (!isExpanded || !hasMore) return;

        const observer = new IntersectionObserver(
            (entries) => {
                if (entries[0].isIntersecting) {
                    loadMore();
                }
            },
            { rootMargin: '300px', threshold: 0 }
        );

        if (sentinelRef.current) {
            observer.observe(sentinelRef.current);
        }

        return () => observer.disconnect();
    }, [isExpanded, hasMore, loadMore]);

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

            {isExpanded && (
                <>
                    <div ref={sentinelRef} className="icons-sentinel" />
                    {hasMore && <Spinner size="small" />}
                </>
            )}
        </div>
    );
}
