import { useMemo } from 'react';
import { HiX } from 'react-icons/hi';
import useNotebookStore from '../stores/notebookStore';
import '../styles/notebook-filters.css';

interface ActiveFiltersDisplayProps {
  collectionId?: string;
  collectionIds?: string[];
  collections: {
    id?: string;
    name?: string
  }[];
  className?: string;
}

const ActiveFiltersDisplay = ({ collectionId, collectionIds, collections, className = '' }: ActiveFiltersDisplayProps): JSX.Element => {
    const {
        getFiltersForCollection,
        getFilterValuesForCollection,
        removeActiveFilter,
        clearAllFilters
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

    const activeFiltersList = useMemo(() => {
        const allFilters = [];

        normalizedCollections.forEach(collection => {
            const activeFilters = getFiltersForCollection(collection.id);
            const filterValues = getFilterValuesForCollection(collection.id);

            Object.entries(activeFilters)
                .filter(([, values]) => values && values.length > 0)
                .forEach(([field, values]) => {
                    values.forEach(value => {
                        allFilters.push({
                            collectionId: collection.id,
                            collectionName: collection.name,
                            field,
                            value,
                            label: filterValues?.[field]?.label || field
                        });
                    });
                });
        });

        return allFilters;
    }, [normalizedCollections, getFiltersForCollection, getFilterValuesForCollection]);

    const handleRemove = (cId, field, value) => {
        removeActiveFilter(cId, field, value);
    };

    const handleClearAll = () => {
        normalizedCollections.forEach(c => clearAllFilters(c.id));
    };

    if (activeFiltersList.length === 0) {
        return null;
    }

    return (
        <div className={`notebook-active-filters ${className}`}>
            {activeFiltersList.map(({ collectionId: cId, collectionName, field, value, label }) => (
                <div key={`${cId}-${field}-${value}`} className="notebook-active-filter">
                    {isMulti && collectionName && (
                        <span className="notebook-active-filter-collection">{collectionName}:</span>
                    )}
                    <span className="notebook-active-filter-label">{label}:</span>
                    <span>{value}</span>
                    <button
                        type="button"
                        className="notebook-active-filter-remove"
                        onClick={() => handleRemove(cId, field, value)}
                        aria-label={`Filter ${label}: ${value} entfernen`}
                    >
                        <HiX />
                    </button>
                </div>
            ))}
            {activeFiltersList.length > 1 && (
                <button
                    type="button"
                    className="notebook-clear-all-filters"
                    onClick={handleClearAll}
                >
                    Alle entfernen
                </button>
            )}
        </div>
    );
};

export default ActiveFiltersDisplay;
