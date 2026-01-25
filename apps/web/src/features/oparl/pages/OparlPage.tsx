import { useState, useEffect, useCallback } from 'react';

import { Markdown } from '../../../components/common/Markdown';
import SearchBar from '../../search/components/SearchBar';
import { useOparlSearch } from '../hooks/useOparlSearch';

import '../../search/styles/SearchBarStyles.css';
import '../styles/oparl.css';
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
      <div className="oparl-page-container">
        <div className="oparl-paper-detail">
          <div className="oparl-detail-header">
            <h2 className="oparl-detail-title">{selectedPaper.title}</h2>
            <button
              className="oparl-detail-close"
              onClick={clearSelectedPaper}
              aria-label="Schließen"
            >
              ×
            </button>
          </div>

          <div className="oparl-detail-meta">
            <div className="oparl-detail-meta-item">
              <span className="oparl-detail-meta-label">Stadt</span>
              <span className="oparl-detail-meta-value">{selectedPaper.city}</span>
            </div>
            {selectedPaper.date && (
              <div className="oparl-detail-meta-item">
                <span className="oparl-detail-meta-label">Datum</span>
                <span className="oparl-detail-meta-value">{formatDate(selectedPaper.date)}</span>
              </div>
            )}
            {selectedPaper.paperType && (
              <div className="oparl-detail-meta-item">
                <span className="oparl-detail-meta-label">Typ</span>
                <span className="oparl-detail-meta-value">{selectedPaper.paperType}</span>
              </div>
            )}
            {selectedPaper.reference && (
              <div className="oparl-detail-meta-item">
                <span className="oparl-detail-meta-label">Referenz</span>
                <span className="oparl-detail-meta-value">{selectedPaper.reference}</span>
              </div>
            )}
          </div>

          {selectedPaper.fullText && (
            <div className="oparl-detail-content markdown-content">
              <Markdown fallback={<div>Lade Inhalt...</div>}>{selectedPaper.fullText}</Markdown>
            </div>
          )}

          <div className="oparl-detail-actions">
            {selectedPaper.sourceUrl && (
              <a
                href={selectedPaper.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="oparl-detail-link"
              >
                Original ansehen
              </a>
            )}
            {selectedPaper.mainFileUrl && (
              <a
                href={selectedPaper.mainFileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="oparl-detail-link secondary"
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
    <div className="oparl-page-container">
      <div className="oparl-header">
        <h1>Kommunale Anträge</h1>
        <p className="oparl-subtitle">
          Durchsuche Anträge der Grünen aus {indexedCities.length || '...'} Städten
        </p>
      </div>

      {error && <div className="oparl-error">{error}</div>}

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
        <div className="oparl-city-filter">
          <span className="oparl-city-filter-label">Stadt filtern:</span>
          <select
            className="oparl-city-select"
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
            <button className="oparl-clear-filter" onClick={clearCityFilter}>
              Filter löschen
            </button>
          )}
        </div>
      )}

      {isSearching && (
        <div className="oparl-loading">
          <div className="oparl-loading-spinner" />
          <span>Suche läuft...</span>
        </div>
      )}

      {!isSearching && lastQuery && results.length === 0 && (
        <div className="oparl-empty">Keine Ergebnisse für "{lastQuery}" gefunden</div>
      )}

      {!isSearching && results.length > 0 && (
        <div className="oparl-results-section">
          <div className="oparl-results-header">
            <span className="oparl-results-count">
              {totalResults} Ergebnis{totalResults !== 1 ? 'se' : ''}
              {selectedCity && ` in ${selectedCity}`}
            </span>
          </div>

          <div className="oparl-results-grid">
            {results.map((paper) => (
              <div key={paper.id} className="oparl-paper-card" onClick={() => selectPaper(paper)}>
                <h3 className="oparl-paper-title">{paper.title}</h3>

                <div className="oparl-paper-meta">
                  <span className="oparl-paper-city">{paper.city}</span>
                  {paper.date && <span className="oparl-paper-date">{formatDate(paper.date)}</span>}
                </div>

                {paper.paperType && <span className="oparl-paper-type">{paper.paperType}</span>}

                {paper.matchedChunk && (
                  <div className="oparl-paper-snippet">
                    <p className="oparl-snippet-text">{truncateText(paper.matchedChunk, 150)}</p>
                  </div>
                )}

                <div className="oparl-paper-score">Relevanz: {Math.round(paper.score * 100)}%</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default OparlPage;
