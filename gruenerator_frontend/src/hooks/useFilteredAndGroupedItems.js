import { useMemo } from 'react';
import { getSearchValueFactory, getSortValueFactory } from '../components/utils/documentOverviewUtils';

export const useFilteredAndGroupedItems = ({
  items = [],
  itemType = 'document',
  searchFields = [],
  sortBy = 'updated_at',
  sortOrder = 'desc',
  enableGrouping = false,
  searchState,
}) => {
  const getSearchValue = useMemo(() => getSearchValueFactory(itemType), [itemType]);
  const getSortValue = useMemo(() => getSortValueFactory(itemType), [itemType]);

  const filteredItems = useMemo(() => {
    if (!Array.isArray(items)) return [];

    let filtered = [...items];

    if (searchState?.shouldFilterLocally?.()) {
      const query = (searchState.searchQuery || '').toLowerCase();
      filtered = filtered.filter((item) =>
        searchFields.some((field) => {
          const value = getSearchValue(item, field);
          return value && value.toLowerCase().includes(query);
        })
      );
    }

    filtered.sort((a, b) => {
      const valueA = getSortValue(a, sortBy);
      const valueB = getSortValue(b, sortBy);
      return sortOrder === 'asc' ? (valueA > valueB ? 1 : -1) : valueA < valueB ? 1 : -1;
    });

    return filtered;
  }, [items, searchFields, sortBy, sortOrder, getSearchValue, getSortValue, searchState]);

  const groupedItems = useMemo(() => {
    if (!enableGrouping || itemType !== 'document') return {};
    return filteredItems.reduce((groups, item) => {
      let sourceType = item.source_type;
      // Support the new 'gruenerierte_texte' group and default to 'manual' for unrecognized types
      if (!['manual', 'wolke', 'url', 'gruenerierte_texte'].includes(sourceType)) {
        sourceType = 'manual';
      }
      if (!groups[sourceType]) groups[sourceType] = [];
      groups[sourceType].push(item);
      return groups;
    }, {});
  }, [filteredItems, enableGrouping, itemType]);

  return { filteredItems, groupedItems };
};

export default useFilteredAndGroupedItems;

