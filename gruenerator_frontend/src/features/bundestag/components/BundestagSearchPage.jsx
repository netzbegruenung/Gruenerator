import React, { useState } from 'react';
import SearchBar from '../../search/components/SearchBar';
import GalleryLayout from '../../../components/common/Gallery/GalleryLayout';
import BundestagDocumentCard from './BundestagDocumentCard';
import useBundestagSearch from '../hooks/useBundestagSearch';
import ErrorBoundary from '../../../components/ErrorBoundary';
import { useDocumentsStore } from '../../../stores/documentsStore';
import { useOptimizedAuth } from '../../../hooks/useAuth';
import apiClient from '../../../components/utils/apiClient';
import '../styles/BundestagFilters.css';

const bundestagExampleQuestions = [
  {
    icon: '🏛️',
    text: 'Klimaschutzgesetz'
  },
  {
    icon: '🌿',
    text: 'Erneuerbare Energien'
  },
  {
    icon: '🚲',
    text: 'Verkehrswende'
  },
  {
    icon: '🏠',
    text: 'Mietrecht'
  },
  {
    icon: '💚',
    text: 'Digitalisierung'
  }
];

const DocumentTypeFilter = ({ options, onChange, onApply, onReset }) => {
  const handleApply = () => {
    if (onApply) onApply();
  };

  const handleReset = () => {
    const resetOptions = {
      includeDrucksachen: true,
      includePlenarprotokolle: true,
      includeVorgaenge: false,
      maxDrucksachen: 5,
      maxPlenarprotokolle: 3,
      maxVorgaenge: 2
    };
    onChange(resetOptions);
    if (onReset) onReset();
  };

  return (
    <div className="document-type-filter">
      <div className="filter-section">
        <h4 className="filter-section-title">Dokumenttypen</h4>
        <div className="filter-options">
          <label className="filter-option">
            <input
              type="checkbox"
              checked={options.includeDrucksachen}
              onChange={(e) => onChange({ ...options, includeDrucksachen: e.target.checked })}
            />
            <div className="filter-option-label">
              <span>Drucksachen</span>
              <div className="filter-option-description">Gesetzentwürfe, Anträge, Anfragen</div>
            </div>
          </label>
          
          <label className="filter-option">
            <input
              type="checkbox"
              checked={options.includePlenarprotokolle}
              onChange={(e) => onChange({ ...options, includePlenarprotokolle: e.target.checked })}
            />
            <div className="filter-option-label">
              <span>Plenarprotokolle</span>
              <div className="filter-option-description">Bundestagssitzungen, Debatten</div>
            </div>
          </label>
          
          <label className="filter-option">
            <input
              type="checkbox"
              checked={options.includeVorgaenge}
              onChange={(e) => onChange({ ...options, includeVorgaenge: e.target.checked })}
            />
            <div className="filter-option-label">
              <span>Vorgänge</span>
              <div className="filter-option-description">Gesetzgebungsverfahren</div>
            </div>
          </label>
        </div>
      </div>

      <div className="filter-section">
        <h4 className="filter-section-title">Anzahl Ergebnisse</h4>
        <div className="filter-options">
          <div className="filter-number-option">
            <label>Max. Drucksachen:</label>
            <input
              type="number"
              min="1"
              max="10"
              value={options.maxDrucksachen}
              onChange={(e) => onChange({ ...options, maxDrucksachen: parseInt(e.target.value) || 5 })}
            />
          </div>
          <div className="filter-number-option">
            <label>Max. Plenarprotokolle:</label>
            <input
              type="number"
              min="1"
              max="5"
              value={options.maxPlenarprotokolle}
              onChange={(e) => onChange({ ...options, maxPlenarprotokolle: parseInt(e.target.value) || 3 })}
            />
          </div>
          <div className="filter-number-option">
            <label>Max. Vorgänge:</label>
            <input
              type="number"
              min="1"
              max="3"
              value={options.maxVorgaenge}
              onChange={(e) => onChange({ ...options, maxVorgaenge: parseInt(e.target.value) || 2 })}
            />
          </div>
        </div>
      </div>

      <div className="filter-actions">
        <button 
          type="button" 
          className="secondary-button"
          onClick={handleReset}
        >
          Zurücksetzen
        </button>
        <button 
          type="button" 
          className="primary-button"
          onClick={handleApply}
        >
          Anwenden
        </button>
      </div>
    </div>
  );
};

const BundestagSearchPage = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [searchOptions, setSearchOptions] = useState({
    includeDrucksachen: true,
    includePlenarprotokolle: true,
    includeVorgaenge: false,
    maxDrucksachen: 5,
    maxPlenarprotokolle: 3,
    maxVorgaenge: 2
  });

  // Save to documents state
  const [savingDocuments, setSavingDocuments] = useState(new Set());
  const [saveMessage, setSaveMessage] = useState('');
  const [saveError, setSaveError] = useState('');

  // Auth and documents store
  const { user } = useOptimizedAuth();
  const { fetchDocuments } = useDocumentsStore();

  const { 
    results, 
    loading, 
    error, 
    totalResults, 
    search,
    getDocument 
  } = useBundestagSearch();

  const handleSearch = async (query) => {
    setSearchQuery(query);
    await search(query, searchOptions);
  };

  const handleApplyFilters = () => {
    // Close the popover and trigger a new search if there's a query
    setShowFilters(false);
    if (searchQuery) {
      search(searchQuery, searchOptions);
    }
  };

  const handleResetFilters = () => {
    // Reset is handled in DocumentTypeFilter component
    // This just closes the popover
    setShowFilters(false);
  };

  const handleDocumentClick = async (document) => {
    try {
      // For now, just open the URL if available
      if (document.url) {
        window.open(document.url, '_blank', 'noopener,noreferrer');
      } else {
        // Could implement modal or detailed view here
        console.log('Document details:', document);
      }
    } catch (error) {
      console.error('Error opening document:', error);
    }
  };

  const handleSaveToDocuments = async (document) => {
    if (!user) {
      setSaveError('Sie müssen angemeldet sein, um Dokumente zu speichern.');
      return;
    }

    const documentKey = `${document.type}-${document.id}`;
    
    // Prevent duplicate saves
    if (savingDocuments.has(documentKey)) {
      return;
    }

    // Clear previous messages
    setSaveMessage('');
    setSaveError('');

    console.log(`[BundestagSearchPage] Saving document ${document.type}/${document.id}:`, {
      hasText: !!document.text,
      textLength: document.text ? document.text.length : 0,
      textPreview: document.text ? document.text.substring(0, 50) + '...' : 'NO TEXT',
      documentKeys: Object.keys(document)
    });

    // Add to saving set
    setSavingDocuments(prev => new Set([...prev, documentKey]));

    try {
      const response = await apiClient.post('/bundestag/save-to-documents', {
        bundestagDocument: document
      });

      const result = response.data;
      
      if (result.success) {
        setSaveMessage(`"${document.title}" wurde erfolgreich zu Ihren Dokumenten hinzugefügt.`);
        
        // Refresh documents list
        await fetchDocuments();
        
        // Clear success message after 5 seconds
        setTimeout(() => setSaveMessage(''), 5000);
      } else {
        throw new Error(result.message || 'Failed to save document');
      }

    } catch (error) {
      console.error('Error saving bundestag document:', error);
      
      // Extract user-friendly error message (same pattern as useSaveToLibrary)
      let errorMessage = 'Fehler beim Speichern des Bundestag-Dokuments.';
      
      if (error.response?.data?.message) {
        errorMessage = error.response.data.message;
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      setSaveError(`Fehler beim Speichern: ${errorMessage}`);
      
      // Clear error message after 8 seconds
      setTimeout(() => setSaveError(''), 8000);
    } finally {
      // Remove from saving set
      setSavingDocuments(prev => {
        const newSet = new Set(prev);
        newSet.delete(documentKey);
        return newSet;
      });
    }
  };

  const filterComponent = (
    <DocumentTypeFilter 
      options={searchOptions}
      onChange={setSearchOptions}
      onApply={handleApplyFilters}
      onReset={handleResetFilters}
    />
  );

  const searchBarElement = (
    <SearchBar 
      onSearch={handleSearch} 
      loading={loading} 
      value={searchQuery}
      onChange={setSearchQuery}
      placeholder="Bundestag-Dokumente durchsuchen..."
      exampleQuestions={bundestagExampleQuestions}
      onFilterClick={() => setShowFilters(!showFilters)}
      showFilters={showFilters}
      filterComponent={filterComponent}
      filterTitle="Dokument-Filter"
    />
  );

  return (
    <ErrorBoundary>
      <div className="bundestag-search-page">
        <GalleryLayout
          title="Bundestag-Dokumentensuche"
          introText="Durchsuchen Sie Drucksachen, Plenarprotokolle und Vorgänge des Deutschen Bundestags"
          mainSearchBar={searchBarElement}
        >
          {/* Save messages */}
          {saveMessage && (
            <div className="search-success" style={{ marginBottom: 'var(--spacing-medium)' }}>
              <p>✅ {saveMessage}</p>
            </div>
          )}

          {saveError && (
            <div className="search-error" style={{ marginBottom: 'var(--spacing-medium)' }}>
              <p>❌ {saveError}</p>
            </div>
          )}

          {loading && (
            <div className="search-loading">
              <div className="loading-spinner"></div>
              <p>Suche Bundestag-Dokumente...</p>
            </div>
          )}

          {error && (
            <div className="search-error">
              <p>❌ {error}</p>
            </div>
          )}

          {!loading && !error && results.length === 0 && searchQuery && (
            <div className="no-results">
              <p>Keine Dokumente gefunden für "{searchQuery}"</p>
              <p>Versuchen Sie andere Suchbegriffe oder ändern Sie die Dokumenttyp-Filter.</p>
            </div>
          )}

          {!loading && !error && results.length === 0 && !searchQuery && (
            <div className="welcome-message">
              <h2>Willkommen zur Bundestag-Dokumentensuche</h2>
              <p>Geben Sie einen Suchbegriff ein, um parlamentarische Dokumente zu finden.</p>
              <div className="example-searches">
                <h3>Beispiel-Suchen:</h3>
                <div className="example-buttons">
                  {bundestagExampleQuestions.map((example, index) => (
                    <button
                      key={index}
                      className="example-button"
                      onClick={() => handleSearch(example.text)}
                    >
                      <span>{example.icon}</span>
                      <span>{example.text}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {results.length > 0 && (
            <>
              <div className="results-summary">
                <p>
                  {totalResults > results.length 
                    ? `${results.length} von ${totalResults} Dokumenten angezeigt`
                    : `${results.length} Dokument${results.length !== 1 ? 'e' : ''} gefunden`
                  }
                  {searchQuery && ` für "${searchQuery}"`}
                </p>
              </div>
              
              {results.map((document) => {
                const documentKey = `${document.type}-${document.id}`;
                const isSaving = savingDocuments.has(documentKey);
                
                return (
                  <BundestagDocumentCard
                    key={documentKey}
                    document={document}
                    onClick={handleDocumentClick}
                    onSaveToDocuments={user ? handleSaveToDocuments : null}
                    isSaving={isSaving}
                  />
                );
              })}
            </>
          )}
        </GalleryLayout>
      </div>
    </ErrorBoundary>
  );
};

export default BundestagSearchPage;