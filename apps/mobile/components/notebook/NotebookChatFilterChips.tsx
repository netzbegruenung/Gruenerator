import { useMemo } from 'react';
import { useShallow } from 'zustand/shallow';

import { collectionLabel } from '../../config/notebooksConfig';
import { TOPIC_LABELS, type TopicCategory } from '../../config/topicConfig';
import { useNotebookFilterStore } from '../../stores/notebookFilterStore';

import { ParsedFilterChips } from './ParsedFilterChips';

const SOURCES_KEY = 'sources';

function valueLabel(field: string, value: string): string {
  return field === 'themes' ? (TOPIC_LABELS[value as TopicCategory] ?? value) : value;
}

function sourcesLabel(collectionIds: readonly string[]): string {
  return collectionIds.length <= 2
    ? collectionIds.map(collectionLabel).join(', ')
    : `${collectionIds.length} Quellen`;
}

/**
 * Everything every question in this notebook chat is filtered by — keyword
 * facets and an aggregate notebook's source selection, set on the notebook
 * page (a tapped topic, the options sheet) and otherwise invisible here.
 * Dropping a chip lifts that restriction for the next question.
 */
export function NotebookChatFilterChips({ notebookId }: { notebookId: string }) {
  const { owner, keywordFilters, collectionIds, toggleValue, clearCollections } =
    useNotebookFilterStore(
      useShallow((s) => ({
        owner: s.notebookId,
        keywordFilters: s.keywordFilters,
        collectionIds: s.collectionIds,
        toggleValue: s.toggleValue,
        clearCollections: s.clearCollections,
      }))
    );

  const chips = useMemo(() => {
    if (owner !== notebookId) return [];
    const facetChips = Object.entries(keywordFilters).flatMap(([field, values]) =>
      values.map((value) => ({
        key: JSON.stringify([field, value]),
        label: valueLabel(field, value),
      }))
    );
    return collectionIds
      ? [{ key: SOURCES_KEY, label: sourcesLabel(collectionIds) }, ...facetChips]
      : facetChips;
  }, [owner, notebookId, keywordFilters, collectionIds]);

  return (
    <ParsedFilterChips
      chips={chips}
      onDrop={(key) => {
        if (key === SOURCES_KEY) {
          clearCollections();
          return;
        }
        const [field, value] = JSON.parse(key) as [string, string];
        toggleValue(field, value);
      }}
    />
  );
}
