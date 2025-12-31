import { useEffect, useMemo, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { HiAdjustmentsHorizontal, HiXMark, HiCheck, HiArrowPath, HiChevronDown, HiChevronRight } from 'react-icons/hi2';
import useNotebookStore from '../stores/notebookStore';
import DateRangeFilter from './DateRangeFilter';
import '../styles/notebook-filters.css';

const FilterDropdownButton = ({
    collectionId,
    collectionIds,
    collections,
    disabled = false,
    className = ''
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const [expandedCollections, setExpandedCollections] = useState({});
    const dropdownRef = useRef(null);

    const toggleCollection = (collectionId) => {
        setExpandedCollections(prev => ({
            ...prev,
            [collectionId]: !prev[collectionId]
        }));
    };

    const {
        fetchFilterValues,
        getFilterValuesForCollection,
        getFiltersForCollection,
        setActiveFilter,
        clearAllFilters,
        isLoadingFilters,
        filterValuesCache,
        loadingFilters,
        activeFilters
    } = useNotebookStore();

    const normalizedCollections = useMemo(() => {
        if (collections && collections.length > 0) {
            return collections;
        }
        if (collectionIds && collectionIds.length > 0) {
            return collectionIds.map(id => ({ id, name: null }));
        }
        if (collectionId) {
            return [{ id: collectionId, name: null }];
        }
        return [];
    }, [collectionId, collectionIds, collections]);

    const isMulti = normalizedCollections.length > 1;

    useEffect(() => {
        normalizedCollections.forEach(collection => {
            if (collection.id) {
                fetchFilterValues(collection.id);
            }
        });
    }, [normalizedCollections, fetchFilterValues]);

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        };

        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [isOpen]);

    const activeFilterCount = useMemo(() => {
        let count = 0;
        normalizedCollections.forEach(collection => {
            const filters = getFiltersForCollection(collection.id);
            count += Object.keys(filters).length;
        });
        return count;
    }, [normalizedCollections, getFiltersForCollection, activeFilters]);

    const filterGroups = useMemo(() => {
        const groups = [];
        normalizedCollections.forEach(collection => {
            const filterValues = getFilterValuesForCollection(collection.id);
            const loading = isLoadingFilters(collection.id);

            if (loading) {
                groups.push({
                    collectionId: collection.id,
                    collectionName: collection.name,
                    loading: true,
                    fields: []
                });
                return;
            }

            if (!filterValues) return;

            const collectionActiveFilters = getFiltersForCollection(collection.id);
            const fields = Object.entries(filterValues)
                .map(([field, config]) => ({
                    field,
                    label: config.label || field,
                    type: config.type || 'keyword',
                    values: config.values || [],
                    min: config.min,
                    max: config.max,
                    activeValue: collectionActiveFilters[field]
                }))
                .filter(group => group.type === 'date_range' || group.values.length > 0);

            if (fields.length > 0) {
                groups.push({
                    collectionId: collection.id,
                    collectionName: collection.name,
                    loading: false,
                    fields
                });
            }
        });
        return groups;
    }, [normalizedCollections, filterValuesCache, loadingFilters, activeFilters, getFilterValuesForCollection, getFiltersForCollection, isLoadingFilters]);

    const handleChipClick = (collectionIdParam, field, value) => {
        setActiveFilter(collectionIdParam, field, value);
    };

    const handleClearAll = () => {
        normalizedCollections.forEach(collection => {
            clearAllFilters(collection.id);
        });
    };

    const hasFilters = filterGroups.some(g => !g.loading && g.fields.length > 0);
    const allLoaded = filterGroups.every(g => !g.loading);

    if (normalizedCollections.length === 0 || (!hasFilters && allLoaded)) {
        return null;
    }

    return (
        <div className={`notebook-filter-dropdown-wrapper ${className}`} ref={dropdownRef}>
            <button
                type="button"
                className={`notebook-filter-button ${isOpen ? 'active' : ''} ${activeFilterCount > 0 ? 'has-filters' : ''}`}
                onClick={() => setIsOpen(!isOpen)}
                disabled={disabled}
                aria-label="Filter"
                title="Filter"
            >
                <HiAdjustmentsHorizontal />
                {activeFilterCount > 0 && (
                    <span className="notebook-filter-button-badge">{activeFilterCount}</span>
                )}
            </button>

            {isOpen && (
                <div className="notebook-filter-dropdown">
                    <div className="notebook-filter-dropdown-header">
                        <span className="notebook-filter-dropdown-title">
                            Filter{activeFilterCount > 0 && ` (${activeFilterCount} aktiv)`}
                        </span>
                        <div className="notebook-filter-dropdown-actions">
                            {activeFilterCount > 0 && (
                                <button
                                    type="button"
                                    onClick={handleClearAll}
                                    title="Alle zurücksetzen"
                                    className="notebook-filter-action-btn"
                                >
                                    <HiArrowPath />
                                </button>
                            )}
                            <button
                                type="button"
                                onClick={() => setIsOpen(false)}
                                title="Schließen"
                                className="notebook-filter-action-btn"
                            >
                                <HiXMark />
                            </button>
                        </div>
                    </div>
                    <div className="notebook-filter-dropdown-content">
                        {filterGroups.map((group, groupIndex) => {
                            const isExpanded = expandedCollections[group.collectionId] === true;
                            const hasActiveFilters = group.fields?.some(f => f.activeValue);

                            return (
                                <div key={group.collectionId || groupIndex} className="notebook-filter-dropdown-collection">
                                    <button
                                        type="button"
                                        className={`notebook-filter-dropdown-collection-header ${hasActiveFilters ? 'has-active' : ''}`}
                                        onClick={() => toggleCollection(group.collectionId)}
                                    >
                                        <span className="notebook-filter-collection-toggle">
                                            {isExpanded ? <HiChevronDown /> : <HiChevronRight />}
                                        </span>
                                        <span className="notebook-filter-collection-name">
                                            {group.collectionName || 'Filter'}
                                        </span>
                                        {hasActiveFilters && (
                                            <span className="notebook-filter-collection-badge">●</span>
                                        )}
                                    </button>
                                    {isExpanded && (
                                        <div className="notebook-filter-dropdown-collection-content">
                                            {group.loading ? (
                                                <div className="notebook-filter-skeleton">
                                                    <div className="notebook-filter-skeleton-chip" />
                                                    <div className="notebook-filter-skeleton-chip" />
                                                </div>
                                            ) : (
                                                group.fields.map(({ field, label, type, values, min, max, activeValue }) => (
                                                    <div key={`${group.collectionId}-${field}`} className="notebook-filter-group">
                                                        {type === 'date_range' ? (
                                                            <DateRangeFilter
                                                                label={label}
                                                                min={min}
                                                                max={max}
                                                                dateFrom={activeValue?.date_from}
                                                                dateTo={activeValue?.date_to}
                                                                onDateFromChange={(value) => handleChipClick(group.collectionId, field, { date_from: value, date_to: activeValue?.date_to })}
                                                                onDateToChange={(value) => handleChipClick(group.collectionId, field, { date_from: activeValue?.date_from, date_to: value })}
                                                                onClear={() => setActiveFilter(group.collectionId, field, null)}
                                                            />
                                                        ) : (
                                                            <>
                                                                <span className="notebook-filter-group-label">{label}</span>
                                                                <div className="notebook-filter-chips">
                                                                    {values.map(item => {
                                                                        const isObject = typeof item === 'object' && item !== null;
                                                                        const displayValue = isObject ? item.value : item;
                                                                        const count = isObject ? item.count : null;
                                                                        const isActive = activeValue?.includes(displayValue);
                                                                        return (
                                                                            <button
                                                                                key={displayValue}
                                                                                type="button"
                                                                                className={`notebook-filter-chip ${isActive ? 'active' : ''}`}
                                                                                onClick={() => handleChipClick(group.collectionId, field, displayValue)}
                                                                            >
                                                                                {isActive && <HiCheck className="notebook-filter-chip-check" />}
                                                                                <span>{displayValue}</span>
                                                                                {count !== null && (
                                                                                    <span className="notebook-filter-chip-count">({count})</span>
                                                                                )}
                                                                            </button>
                                                                        );
                                                                    })}
                                                                </div>
                                                            </>
                                                        )}
                                                    </div>
                                                ))
                                            )}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
};

FilterDropdownButton.propTypes = {
    collectionId: PropTypes.string,
    collectionIds: PropTypes.arrayOf(PropTypes.string),
    collections: PropTypes.arrayOf(PropTypes.shape({
        id: PropTypes.string.isRequired,
        name: PropTypes.string
    })),
    disabled: PropTypes.bool,
    className: PropTypes.string
};

export default FilterDropdownButton;
