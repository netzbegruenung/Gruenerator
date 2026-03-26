import { useCallback, useEffect } from 'react';

import { useSlidesAdapter, createSlidesApiClient } from '../context/SlidesContext';
import { usePresentationStore } from '../stores/presentationStore';
import { type Presentation } from '../types/slide';

interface PresentationListProps {
  searchQuery?: string;
  onPresentationClick?: (id: string) => void;
}

function PresentationCard({
  presentation,
  onClick,
}: {
  presentation: Presentation;
  onClick: () => void;
}) {
  const date = new Date(presentation.updatedAt);
  const formatted = date.toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });

  return (
    <button
      onClick={onClick}
      className="group w-full text-left rounded-xl border border-grey-200 dark:border-grey-700 bg-white dark:bg-grey-800 overflow-hidden transition-all hover:shadow-md hover:border-grey-300 dark:hover:border-grey-600 cursor-pointer"
    >
      <div className="aspect-video bg-grey-100 dark:bg-grey-700 flex items-center justify-center">
        <svg
          width="48"
          height="48"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          className="text-grey-400 group-hover:text-primary-500 transition-colors"
        >
          <rect x="2" y="3" width="20" height="14" rx="2" />
          <path d="M8 21h8M12 17v4" />
        </svg>
      </div>
      <div className="p-3">
        <h3 className="text-sm font-medium text-foreground truncate">{presentation.title}</h3>
        <p className="text-xs text-grey-500 mt-1">{formatted}</p>
      </div>
    </button>
  );
}

export function PresentationList({ searchQuery, onPresentationClick }: PresentationListProps) {
  const adapter = useSlidesAdapter();
  const apiClient = createSlidesApiClient(adapter);
  const { presentations, isLoading, fetchPresentations } = usePresentationStore();

  useEffect(() => {
    fetchPresentations(apiClient);
  }, []);

  const handleCreate = useCallback(async () => {
    const store = usePresentationStore.getState();
    try {
      const presentation = await store.createPresentation(apiClient, {
        title: 'Neue Präsentation',
      });
      if (onPresentationClick) {
        onPresentationClick(presentation.id);
      }
    } catch {
      // error stored in store
    }
  }, [apiClient, onPresentationClick]);

  const filtered = searchQuery
    ? presentations.filter((p) => p.title.toLowerCase().includes(searchQuery.toLowerCase()))
    : presentations;

  if (isLoading && presentations.length === 0) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-grey-400">Lade Präsentationen...</div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-md">
        <h2 className="text-lg font-semibold text-foreground">Präsentationen</h2>
        <button
          onClick={handleCreate}
          className="px-4 py-2 rounded-lg bg-primary-500 text-white hover:bg-primary-600 transition-colors text-sm font-medium"
        >
          + Neue Präsentation
        </button>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16">
          <svg
            width="64"
            height="64"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1"
            className="mx-auto text-grey-300 mb-4"
          >
            <rect x="2" y="3" width="20" height="14" rx="2" />
            <path d="M8 21h8M12 17v4" />
          </svg>
          <p className="text-grey-500">
            {searchQuery ? 'Keine Präsentationen gefunden' : 'Noch keine Präsentationen erstellt'}
          </p>
          {!searchQuery && (
            <button
              onClick={handleCreate}
              className="mt-4 px-4 py-2 rounded-lg border border-grey-300 dark:border-grey-600 text-sm hover:bg-grey-50 dark:hover:bg-grey-800 transition-colors"
            >
              Erste Präsentation erstellen
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {filtered.map((presentation) => (
            <PresentationCard
              key={presentation.id}
              presentation={presentation}
              onClick={() => onPresentationClick?.(presentation.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
