import { useState, useEffect, useCallback } from 'react';

import { Markdown } from '../../../components/common/Markdown';
import SearchBar from '../../search/components/SearchBar';
import { useOparlSearch } from '../hooks/useOparlSearch';

import '../../../assets/styles/common/markdown-styles.css';
import type { OparlPaper } from '../types';

const exampleQuestions = [
  { icon: '🚲', text: 'Radverkehr Fahrrad' },
  { icon: '🌍', text: 'Klimaschutz CO2' },
  { icon: '🏫', text: 'Schulen Bildung' },
  { icon: '🏠', text: 'Wohnen Miete' },
  { icon: '🌳', text: 'Grünflächen Park' },
];

const formatDate = (dateStr: string | undefined): string => {
  if (!dateStr) return '';
  try {
    return new Date(dateStr).toLocaleDateString('de-DE');
  } catch {
    return dateStr;
  }
};

const truncateText = (text: string | undefined, maxLength: number = 150): string => {
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
};

const OparlPage = () => {
  const [searchValue, setSearchValue] = useState('');
  const {
    results,
    indexedCities,
    selectedCity,
    isSearching,
    error,
    totalResults,
    lastQuery,
    selectedPaper,
    search,
    loadIndexedCities,
    selectCity,
    clearCityFilter,
    selectPaper,
    clearSelectedPaper,
  } = useOparlSearch();

  useEffect(() => {
    loadIndexedCities();
  }, [loadIndexedCities]);

  const handleSearch = useCallback(
    (query?: string) => {
      if (query) {
        search(query);
      }
    },
    [search]
  );

  const handleCityChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const city = e.target.value;
      if (city === '') {
        clearCityFilter();
      } else {
        selectCity(city);
      }
    },
    [selectCity, clearCityFilter]
  );

  if (selectedPaper) {
    return (
      <div className="flex flex-col items-center min-h-screen p-5 bg-background transition-colors duration-300">
        <div className="w-full max-w-[750px] mx-auto my-5 p-[35px] bg-background-alt dark:bg-hover-alt rounded-lg shadow-[0_2px_4px_rgba(0,0,0,0.1)] relative max-md:mx-4 max-md:p-5">
          <div className="flex justify-between items-start mb-5">
            <h2 className="text-foreground-heading m-0 text-2xl max-md:text-xl font-semibold flex-1 pr-4">
              {selectedPaper.title}
            </h2>
            <button
              className="bg-transparent border-none text-2xl text-foreground cursor-pointer px-2 py-1 opacity-70 transition-opacity duration-200 hover:opacity-100"
              onClick={clearSelectedPaper}
              aria-label="Schließen"
            >
              ×
            </button>
          </div>

          <div className="flex flex-wrap gap-4 mb-5 pb-4 border-b border-grey-200 dark:border-grey-700">
            <div className="flex flex-col gap-0.5">
              <span className="text-xs text-foreground opacity-60 uppercase">Stadt</span>
              <span className="text-sm text-foreground font-medium">{selectedPaper.city}</span>
            </div>
            {selectedPaper.date && (
              <div className="flex flex-col gap-0.5">
                <span className="text-xs text-foreground opacity-60 uppercase">Datum</span>
                <span className="text-sm text-foreground font-medium">
                  {formatDate(selectedPaper.date)}
                </span>
              </div>
            )}
            {selectedPaper.paperType && (
              <div className="flex flex-col gap-0.5">
                <span className="text-xs text-foreground opacity-60 uppercase">Typ</span>
                <span className="text-sm text-foreground font-medium">
                  {selectedPaper.paperType}
                </span>
              </div>
            )}
            {selectedPaper.reference && (
              <div className="flex flex-col gap-0.5">
                <span className="text-xs text-foreground opacity-60 uppercase">Referenz</span>
                <span className="text-sm text-foreground font-medium">
                  {selectedPaper.reference}
                </span>
              </div>
            )}
          </div>

          {selectedPaper.fullText && (
            <div className="text-foreground text-[15px] max-h-[60vh] overflow-y-auto pr-2 leading-[1.7] markdown-content [&_p]:mb-[1em] [&_h1]:mt-[1.5em] [&_h1]:mb-[0.5em] [&_h1]:text-foreground-heading [&_h2]:mt-[1.5em] [&_h2]:mb-[0.5em] [&_h2]:text-foreground-heading [&_h3]:mt-[1.5em] [&_h3]:mb-[0.5em] [&_h3]:text-foreground-heading">
              <Markdown fallback={<div>Lade Inhalt...</div>}>{selectedPaper.fullText}</Markdown>
            </div>
          )}

          <div className="flex gap-3 mt-6 pt-4 border-t border-grey-200 dark:border-grey-700 max-md:flex-col">
            {selectedPaper.sourceUrl && (
              <a
                href={selectedPaper.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-[var(--klee)] text-white no-underline rounded-md text-sm font-medium transition-colors duration-200 hover:bg-[var(--tanne)] max-md:justify-center"
              >
                Original ansehen
              </a>
            )}
            {selectedPaper.mainFileUrl && (
              <a
                href={selectedPaper.mainFileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-transparent border border-grey-200 dark:border-grey-700 text-foreground no-underline rounded-md text-sm font-medium transition-colors duration-200 hover:bg-background hover:border-[var(--klee)] max-md:justify-center"
              >
                PDF herunterladen
              </a>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center min-h-screen p-5 bg-background transition-colors duration-300">
      <div className="flex flex-col items-center mb-8 mt-24 max-md:mt-20 max-md:mb-6 max-md:px-4 text-center w-full max-w-[var(--container-max-width,1200px)]">
        <h1 className="text-[56px] max-md:text-4xl text-foreground-heading dark:text-[var(--secondary)] m-0 tracking-[-1px] leading-[1.2]">
          Kommunale Anträge
        </h1>
        <p className="text-xl max-md:text-base text-foreground mt-3 mb-0 opacity-80 font-normal">
          Durchsuche Anträge der Grünen aus {indexedCities.length || '...'} Städten
        </p>
      </div>

      {error && (
        <div className="mt-5 px-4 py-3 bg-[rgba(255,241,122,0.2)] dark:bg-[rgba(255,241,122,0.1)] border border-[var(--sonne)] rounded-lg text-foreground text-center max-w-[584px] w-full max-md:mx-4 max-md:text-sm max-md:max-w-[calc(100%-32px)]">
          {error}
        </div>
      )}

      <SearchBar
        value={searchValue}
        onChange={setSearchValue}
        onSearch={handleSearch}
        loading={isSearching}
        placeholder="Thema eingeben (z.B. Radverkehr, Klimaschutz, Schulen...)"
        exampleQuestions={exampleQuestions}
        hideDisclaimer
      />

      {indexedCities.length > 0 && (
        <div className="flex items-center gap-sm mt-md flex-wrap justify-center max-md:flex-col max-md:items-stretch max-md:px-4">
          <span className="text-sm text-foreground opacity-70">Stadt filtern:</span>
          <select
            className="px-3 py-2 border border-grey-200 dark:border-grey-700 rounded-lg bg-background-alt text-foreground text-sm cursor-pointer min-w-[150px] max-md:w-full focus:outline-none focus:border-[var(--klee)]"
            value={selectedCity || ''}
            onChange={handleCityChange}
          >
            <option value="">Alle Städte</option>
            {indexedCities.map((city) => (
              <option key={city} value={city}>
                {city}
              </option>
            ))}
          </select>
          {selectedCity && (
            <button
              className="px-3 py-2 bg-transparent border border-grey-200 dark:border-grey-700 rounded-lg text-foreground text-sm cursor-pointer transition-all duration-200 hover:bg-background-alt hover:border-[var(--klee)]"
              onClick={clearCityFilter}
            >
              Filter löschen
            </button>
          )}
        </div>
      )}

      {isSearching && (
        <div className="flex flex-col items-center my-10 gap-3 text-foreground">
          <div className="w-8 h-8 border-[3px] border-background-alt border-t-[3px] border-t-[var(--klee)] rounded-full animate-spin" />
          <span>Suche läuft...</span>
        </div>
      )}

      {!isSearching && lastQuery && results.length === 0 && (
        <div className="text-center p-xl text-foreground opacity-70">
          Keine Ergebnisse für &quot;{lastQuery}&quot; gefunden
        </div>
      )}

      {!isSearching && results.length > 0 && (
        <div className="w-full max-w-[800px] mx-auto my-6">
          <div className="flex justify-between items-center px-4 mb-4">
            <span className="text-foreground text-base opacity-80">
              {totalResults} Ergebnis{totalResults !== 1 ? 'se' : ''}
              {selectedCity && ` in ${selectedCity}`}
            </span>
          </div>

          <div className="grid grid-cols-2 max-md:grid-cols-1 gap-4 px-4 max-md:px-0">
            {results.map((paper) => (
              <div
                key={paper.id}
                className="flex flex-col p-4 max-md:p-3.5 bg-background-alt dark:bg-hover-alt rounded-lg max-md:rounded-xl transition-colors duration-200 overflow-hidden cursor-pointer hover:bg-hover-alt dark:hover:bg-background-alt"
                onClick={() => selectPaper(paper)}
              >
                <h3 className="text-foreground-heading m-0 mb-2 text-base max-md:text-sm font-medium line-clamp-2 leading-[1.4]">
                  {paper.title}
                </h3>

                <div className="flex flex-wrap gap-2 mb-2">
                  <span className="text-[13px] text-[var(--klee)] dark:text-[var(--secondary)] font-medium">
                    {paper.city}
                  </span>
                  {paper.date && (
                    <span className="text-[13px] text-foreground opacity-70">
                      {formatDate(paper.date)}
                    </span>
                  )}
                </div>

                {paper.paperType && (
                  <span className="inline-block px-2 py-0.5 bg-[rgba(70,150,43,0.15)] dark:bg-[rgba(0,128,255,0.15)] text-[var(--klee)] dark:text-[var(--secondary)] rounded text-xs">
                    {paper.paperType}
                  </span>
                )}

                {paper.matchedChunk && (
                  <div className="my-2 px-3 py-2 bg-background dark:bg-background-alt rounded border-l-[3px] border-l-[var(--klee)] dark:border-l-[var(--secondary)]">
                    <p className="text-[13px] leading-[1.4] text-foreground opacity-85 m-0 line-clamp-3">
                      {truncateText(paper.matchedChunk, 150)}
                    </p>
                  </div>
                )}

                <div className="text-xs text-foreground opacity-60 mt-auto pt-2">
                  Relevanz: {Math.round(paper.score * 100)}%
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default OparlPage;
