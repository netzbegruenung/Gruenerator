import { JSX, useEffect, useMemo, useRef, useState } from 'react';
import { HiAdjustmentsHorizontal, HiXMark, HiCheck, HiArrowPath, HiChevronDown, HiChevronRight } from 'react-icons/hi2';
import useNotebookStore from '../stores/notebookStore';
import DateRangeFilter from './DateRangeFilter';
import '../styles/notebook-filters.css';

interface FilterDropdownButtonProps {
  collectionId?: string;
  collectionIds?: string[];
  collections?: {
    id?: string;
    name?: string
  }[];
  disabled?: boolean;
  className?: string;
}

interface NormalizedCollection {
  id?: string;
  name?: string | null;
}

interface FilterValueItem {
  value: string;
  count?: number;
}

interface FilterField {
  field: string;
  label: string;
  type: string;
  values: (string | FilterValueItem)[];
  min?: unknown;
  max?: unknown;
  activeValue?: string[] | { date_from?: string; date_to?: string } | null;
}

interface FilterGroup {
  collectionId?: string;
  collectionName?: string | null;
  loading: boolean;
  fields: FilterField[];
}

const FilterDropdownButton = ({ collectionId,
    collectionIds,
    collections,
    disabled = false,
    className = '' }: FilterDropdownButtonProps): JSX.Element => {
    const [isOpen, setIsOpen] = useState<boolean>(false);
    const [expandedCollections, setExpandedCollections] = useState<Record<string, boolean>>({});
    const dropdownRef = useRef<HTMLDivElement>(null);

    const toggleCollection = (collectionId: string | undefined): void => {
        if (!collectionId) return;
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

    const normalizedCollections = useMemo((): NormalizedCollection[] => {
        if (collections && collections.length > 0) {
            return collections;
        }
        if (collectionIds && collectionIds.length > 0) {
            return collectionIds.map(id => ({ id, name: null as string | null }));
        }
        if (collectionId) {
            return [{ id: collectionId, name: null as string | null }];
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
        const handleClickOutside = (event: MouseEvent): void => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
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

    const filterGroups = useMemo((): FilterGroup[] => {
        const groups: FilterGroup[] = [];
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
            const fields: FilterField[] = Object.entries(filterValues as Record<string, { label?: string; type?: string; values?: (string | FilterValueItem)[]; min?: unknown; max?: unknown }>)
                .map(([field, config]) => ({
                    field,
                    label: config.label || field,
                    type: config.type || 'keyword',
                    values: config.values || [],
                    min: config.min,
                    max: config.max,
                    activeValue: collectionActiveFilters[field] as FilterField['activeValue']
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

    const handleChipClick = (collectionIdParam: string | undefined, field: string, value: string | { date_from?: string; date_to?: string }): void => {
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
                            const isExpanded = group.collectionId ? expandedCollections[group.collectionId] === true : false;
                            const hasActiveFilters = group.fields?.some((f: FilterField) => f.activeValue);

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
                                                group.fields.map(({ field, label, type, values, min, max, activeValue }: FilterField) => {
                                                    const dateActiveValue = activeValue as { date_from?: string; date_to?: string } | undefined;
                                                    const arrayActiveValue = activeValue as string[] | undefined;
                                                    return (
                                                    <div key={`${group.collectionId}-${field}`} className="notebook-filter-group">
                                                        {type === 'date_range' ? (
                                                            <DateRangeFilter
                                                                label={label}
                                                                min={min}
                                                                max={max}
                                                                dateFrom={dateActiveValue?.date_from}
                                                                dateTo={dateActiveValue?.date_to}
                                                                onDateFromChange={(value: string) => handleChipClick(group.collectionId, field, { date_from: value, date_to: dateActiveValue?.date_to })}
                                                                onDateToChange={(value: string) => handleChipClick(group.collectionId, field, { date_from: dateActiveValue?.date_from, date_to: value })}
                                                                onClear={() => setActiveFilter(group.collectionId, field, null)}
                                                            />
                                                        ) : (
                                                            <>
                                                                <span className="notebook-filter-group-label">{label}</span>
                                                                <div className="notebook-filter-chips">
                                                                    {values.map((item: string | FilterValueItem) => {
                                                                        const isObject = typeof item === 'object' && item !== null;
                                                                        const displayValue = isObject ? (item as FilterValueItem).value : item as string;
                                                                        const count = isObject ? (item as FilterValueItem).count : null;
                                                                        const isActive = arrayActiveValue?.includes(displayValue);
                                                                        return (
                                                                            <button
                                                                                key={displayValue}
                                                                                type="button"
                                                                                className={`notebook-filter-chip ${isActive ? 'active' : ''}`}
                                                                                onClick={() => handleChipClick(group.collectionId, field, displayValue)}
                                                                            >
                                                                                {isActive && <HiCheck className="notebook-filter-chip-check" />}
                                                                                <span>{displayValue}</span>
                                                                                {count !== null && count !== undefined && (
                                                                                    <span className="notebook-filter-chip-count">({count})</span>
                                                                                )}
                                                                            </button>
                                                                        );
                                                                    })}
                                                                </div>
                                                            </>
                                                        )}
                                                    </div>
                                                )})
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

export default FilterDropdownButton;
