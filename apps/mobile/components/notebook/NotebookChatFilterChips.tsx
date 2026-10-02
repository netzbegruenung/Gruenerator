import { useMemo } from 'react';
import { useShallow } from 'zustand/shallow';

import { TOPIC_LABELS, type TopicCategory } from '../../config/topicConfig';
import { useNotebookFilterStore } from '../../stores/notebookFilterStore';

import { ParsedFilterChips } from './ParsedFilterChips';

function valueLabel(field: string, value: string): string {
  return field === 'themes' ? (TOPIC_LABELS[value as TopicCategory] ?? value) : value;
}

/**
 * The keyword facets every question in this notebook chat is filtered by —
 * set on the notebook page (a tapped topic, the options sheet) and otherwise
 * invisible here. Dropping a chip removes the facet for the next question.
 */
export function NotebookChatFilterChips({ notebookId }: { notebookId: string }) {
  const { owner, keywordFilters, toggleValue } = useNotebookFilterStore(
    useShallow((s) => ({
      owner: s.notebookId,
      keywordFilters: s.keywordFilters,
      toggleValue: s.toggleValue,
    }))
  );

  const chips = useMemo(
    () =>
      owner === notebookId
        ? Object.entries(keywordFilters).flatMap(([field, values]) =>
            values.map((value) => ({
              key: JSON.stringify([field, value]),
              label: valueLabel(field, value),
            }))
          )
        : [],
    [owner, notebookId, keywordFilters]
  );

  return (
    <ParsedFilterChips
      chips={chips}
      onDrop={(key) => {
        const [field, value] = JSON.parse(key) as [string, string];
        toggleValue(field, value);
      }}
    />
  );
}
