import { useState } from 'react';
import { IoSearch } from 'react-icons/io5';

import IndexCard from '../../components/common/IndexCard';
import withAuthRequired from '../../components/common/LoginRequired/withAuthRequired';
import ErrorBoundary from '../../components/ErrorBoundary';
import SearchBar from '../search/components/SearchBar';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import '../../assets/styles/components/gallery-layout.css';

import { useResearch, type ResearchResult } from './useResearch';

const EXAMPLE_QUESTIONS = [
  { icon: '🌍', text: 'Klimaschutz Maßnahmen' },
  { icon: '🚲', text: 'Verkehrswende in Kommunen' },
  { icon: '📚', text: 'Bildungspolitik Positionen' },
];

const COLLECTION_OPTIONS = [
  { id: 'grundsatz-system', label: 'Grundsatzprogramme' },
  { id: 'bundestagsfraktion-system', label: 'Bundestagsfraktion' },
  { id: 'gruene-de-system', label: 'gruene.de' },
  { id: 'oesterreich-gruene-system', label: 'Grüne Österreich' },
  { id: 'gruene-at-system', label: 'gruene.at' },
  { id: 'kommunalwiki-system', label: 'KommunalWiki' },
  { id: 'boell-stiftung-system', label: 'Böll-Stiftung' },
  { id: 'satzungen-system', label: 'Satzungen' },
  { id: 'hamburg-system', label: 'Hamburg' },
  { id: 'schleswig-holstein-system', label: 'Schleswig-Holstein' },
  { id: 'thueringen-system', label: 'Thüringen' },
  { id: 'bayern-system', label: 'Bayern' },
] as const;

function resultToCardProps(result: ResearchResult) {
  const similarityPercent = Math.round(result.similarity_score * 100);
  const tags = result.collection_name ? [result.collection_name] : [];
  const chunkLabel =
    result.chunk_count === 1 ? '1 Textabschnitt' : `${result.chunk_count} Textabschnitte`;

  return {
    title: result.title,
    description: result.relevant_content,
    tags,
    meta: (
      <div className="flex w-full items-center justify-between">
        <span className="text-xs text-grey-500">
          {chunkLabel} · {similarityPercent}% Relevanz
        </span>
        {result.source_url && (
          <a
            href={result.source_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-primary-500 hover:underline"
            onClick={(e: React.MouseEvent) => e.stopPropagation()}
          >
            Quelle öffnen
          </a>
        )}
      </div>
    ),
    onClick: result.source_url
      ? () => window.open(result.source_url!, '_blank', 'noopener,noreferrer')
      : undefined,
  };
}

function ResearchPage() {
  const [query, setQuery] = useState('');
  const [selectedCollections, setSelectedCollections] = useState<string[]>([]);
  const { results, metadata, isLoading, error, search } = useResearch();
  const [hasSearched, setHasSearched] = useState(false);

  const handleSearch = (q?: string) => {
    const searchQuery = q || query;
    if (!searchQuery || searchQuery.trim().length < 2) return;
    setHasSearched(true);
    search(searchQuery, selectedCollections.length > 0 ? selectedCollections : undefined);
  };

  return (
    <ErrorBoundary>
      <div className="gallery-layout">
        <div className="gallery-header">
          <h1>Research</h1>
          <p>Durchsuche alle gescrapten Dokumente und Programme direkt in den Qdrant-Kollektionen.</p>
        </div>

        <SearchBar
          onSearch={handleSearch}
          loading={isLoading}
          value={query}
          onChange={setQuery}
          placeholder="Suchbegriff eingeben (z.B. Klimaschutz, Mobilität, Bildung)..."
          exampleQuestions={EXAMPLE_QUESTIONS}
          hideExamples={hasSearched}
          hideDisclaimer
        />

        <div className="mb-lg mt-md">
          <p className="mb-xs text-xs font-medium text-grey-500 dark:text-grey-400">
            Kollektionen filtern (leer = alle durchsuchen)
          </p>
          <ToggleGroup
            type="multiple"
            value={selectedCollections}
            onValueChange={setSelectedCollections}
            variant="outline"
            size="sm"
            className="flex-wrap"
          >
            {COLLECTION_OPTIONS.map((col) => (
              <ToggleGroupItem key={col.id} value={col.id}>
                {col.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>

        {error && (
          <div className="mb-lg rounded-md border border-red-200 bg-red-50 p-md text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
            {error}
          </div>
        )}

        {metadata && (
          <p className="mb-sm text-xs text-grey-500 dark:text-grey-400">
            {metadata.totalResults} Ergebnisse in {metadata.timeMs}ms
            {metadata.collections.length > 0 &&
              ` aus ${metadata.collections.length} Kollektion${metadata.collections.length > 1 ? 'en' : ''}`}
          </p>
        )}

        {results.length > 0 && (
          <div className="gallery-grid">
            {results.map((result, i) => (
              <IndexCard
                key={`${result.document_id}-${result.collection_id ?? i}`}
                {...resultToCardProps(result)}
              />
            ))}
          </div>
        )}

        {hasSearched && !isLoading && results.length === 0 && !error && (
          <div className="flex flex-col items-center justify-center py-2xl text-center">
            <IoSearch className="mb-sm size-12 text-grey-300 dark:text-grey-600" />
            <p className="text-sm text-grey-500 dark:text-grey-400">
              Keine Ergebnisse gefunden. Versuche einen anderen Suchbegriff oder entferne Filter.
            </p>
          </div>
        )}

        {!hasSearched && !isLoading && (
          <div className="flex flex-col items-center justify-center py-2xl text-center">
            <IoSearch className="mb-sm size-12 text-grey-300 dark:text-grey-600" />
            <p className="text-sm text-grey-500 dark:text-grey-400">
              Gib einen Suchbegriff ein, um Dokumente zu durchsuchen.
            </p>
          </div>
        )}
      </div>
    </ErrorBoundary>
  );
}

export default withAuthRequired(ResearchPage, { title: 'Research' });
