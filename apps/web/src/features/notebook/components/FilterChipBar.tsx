import { JSX, useEffect, useMemo } from 'react';
import useNotebookStore from '../stores/notebookStore';
import '../styles/notebook-filters.css';

interface FilterChipGroupProps {
    collectionId: string;
    collectionName?: string | null;
    showCollectionLabel?: boolean;
}

const FilterChipGroup = ({ collectionId, collectionName, showCollectionLabel }: FilterChipGroupProps): JSX.Element | null => {
    const {
        fetchFilterValues,
        getFilterValuesForCollection,
        getFiltersForCollection,
        setActiveFilter,
        isLoadingFilters
    } = useNotebookStore();

    const filterValues = getFilterValuesForCollection(collectionId);
    const activeFilters = getFiltersForCollection(collectionId);
    const loading = isLoadingFilters(collectionId);

    useEffect(() => {
        if (collectionId) {
            fetchFilterValues(collectionId);
        }
    }, [collectionId, fetchFilterValues]);

    const handleChipClick = (field: string, value: string | { date_from?: string; date_to?: string } | null) => {
        setActiveFilter(collectionId, field, value);
    };

    const filterGroups = useMemo(() => {
        if (!filterValues) return [];

        return Object.entries(filterValues).map(([field, config]) => {
            const configObj = config as Record<string, unknown>;
            return {
                field,
                label: (configObj.label as string) || field,
                values: (configObj.values as unknown[]) || []
            };
        }).filter(group => group.values.length > 0);
    }, [filterValues]);

    if (loading) {
        return (
            <div className="notebook-filter-collection-group">
                {showCollectionLabel && collectionName && (
                    <div className="notebook-filter-collection-label">{collectionName}</div>
                )}
                <div className="notebook-filter-skeleton">
                    <div className="notebook-filter-skeleton-chip" />
                    <div className="notebook-filter-skeleton-chip" />
                </div>
            </div>
        );
    }

    if (filterGroups.length === 0) {
        return null;
    }

    return (
        <div className="notebook-filter-collection-group">
            {showCollectionLabel && collectionName && (
                <div className="notebook-filter-collection-label">{collectionName}</div>
            )}
            {filterGroups.map(({ field, label, values }) => (
                <div key={`${collectionId} -${field} `} className="notebook-filter-group">
                    <span className="notebook-filter-group-label">{label}</span>
                    <div className="notebook-filter-chips">
                        {values.map((item: unknown) => {
                            const isObject = typeof item === 'object' && item !== null;
                            const obj = item as Record<string, unknown>;
                            const displayValue = isObject ? (obj.value as string) : (item as string);
                            const count = isObject ? (obj.count as number | undefined) : null;
                            const fieldFilter = activeFilters[field];
                            const isActive = Array.isArray(fieldFilter) && fieldFilter.includes(displayValue);
                            return (
                                <button
                                    key={displayValue}
                                    type="button"
                                    className={`notebook - filter - chip ${isActive ? 'active' : ''} `}
                                    onClick={() => handleChipClick(field, displayValue)}
                                >
                                    {displayValue}
                                    {count !== null && (
                                        <span className="notebook-filter-chip-count">({count})</span>
                                    )}
                                </button>
                            );
                        })}
                    </div>
                </div>
            ))}
        </div>
    );
};

interface FilterChipBarProps {
    collectionId?: string;
    collectionIds?: string[];
    collections?: { id: string; name: string | null }[];
    className?: string;
}

const FilterChipBar = ({ collectionId, collectionIds, collections, className = '' }: FilterChipBarProps): JSX.Element | null => {
    const normalizedCollections = useMemo(() => {
        if (collections && collections.length > 0) {
            return collections;
        }
        if (collectionIds && collectionIds.length > 0) {
            return collectionIds.map((id: string) => ({ id, name: null }));
        }
        if (collectionId) {
            return [{ id: collectionId, name: null }];
        }
        return [];
    }, [collectionId, collectionIds, collections]);

    const isMulti = normalizedCollections.length > 1;

    if (normalizedCollections.length === 0) {
        return null;
    }

    return (
        <div className={`notebook - filter - bar ${isMulti ? 'multi-collection' : ''} ${className} `}>
            {normalizedCollections.map((collection: { id: string; name: string | null }) => (
                <FilterChipGroup
                    key={collection.id}
                    collectionId={collection.id}
                    collectionName={collection.name}
                    showCollectionLabel={isMulti}
                />
            ))}
        </div>
    );
};

export default FilterChipBar;
