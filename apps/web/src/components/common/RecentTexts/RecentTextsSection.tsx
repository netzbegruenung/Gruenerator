import React, { useState, useCallback } from 'react';
import { useRecentTexts, type SavedText } from '../../../hooks/useRecentTexts';
import RecentTextCard from './RecentTextCard';
import LoadTextConfirmModal from '../Modals/LoadTextConfirmModal';
import { HiFolder, HiRefresh } from 'react-icons/hi';

export interface RecentTextsSectionProps {
  generatorType: string;
  componentName: string;
  onTextLoad: (content: string, metadata: unknown) => void;
  className?: string;
}

/**
 * Section displaying recent texts for a generator type
 * Includes loading state, empty state, and error handling
 */
const RecentTextsSection: React.FC<RecentTextsSectionProps> = ({
  generatorType,
  componentName,
  onTextLoad,
  className = ''
}) => {
  const { texts, isLoading, error, refetch, deleteText } = useRecentTexts({
    generatorType,
    limit: 3,
    enabled: true
  });

  const [selectedText, setSelectedText] = useState<SavedText | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const handleTextSelect = useCallback((text: SavedText) => {
    setSelectedText(text);
    setIsModalOpen(true);
  }, []);

  const handleConfirmLoad = useCallback(() => {
    if (selectedText) {
      const metadata = {
        title: selectedText.title,
        contentType: selectedText.type,
        wordCount: selectedText.word_count
      };

      onTextLoad(selectedText.content, metadata);
      setIsModalOpen(false);
      setSelectedText(null);
    }
  }, [selectedText, onTextLoad]);

  const handleCancelLoad = useCallback(() => {
    setIsModalOpen(false);
    setSelectedText(null);
  }, []);

  // Don't render if no texts and not loading
  if (!isLoading && texts.length === 0 && !error) {
    return null;
  }

  return (
    <section className={`recent-texts-section ${className}`} aria-labelledby="recent-texts-title">
      <div className="recent-texts-header">
        <h3 id="recent-texts-title" className="recent-texts-title">
          <HiFolder size={20} aria-hidden="true" />
          Zuletzt erstellt
        </h3>
        {!isLoading && texts.length > 0 && (
          <button
            className="recent-texts-refresh"
            onClick={() => refetch()}
            aria-label="Aktualisieren"
            title="Aktualisieren"
          >
            <HiRefresh size={18} />
          </button>
        )}
      </div>

      {error && (
        <div className="recent-texts-error" role="alert">
          <p>Fehler beim Laden der Texte: {error}</p>
          <button className="button button--sm" onClick={() => refetch()}>
            Erneut versuchen
          </button>
        </div>
      )}

      {isLoading && (
        <div className="recent-texts-loading" aria-live="polite" aria-busy="true">
          <div className="recent-texts-skeleton">
            <div className="skeleton-card" />
            <div className="skeleton-card" />
            <div className="skeleton-card" />
          </div>
        </div>
      )}

      {!isLoading && !error && texts.length > 0 && (
        <div className="recent-texts-grid">
          {texts.map((text) => (
            <RecentTextCard
              key={text.id}
              text={text}
              onSelect={handleTextSelect}
              onDelete={deleteText}
            />
          ))}
        </div>
      )}

      {!isLoading && !error && texts.length === 0 && (
        <div className="recent-texts-empty">
          <p>Noch keine gespeicherten Texte vorhanden.</p>
          <p className="recent-texts-empty-hint">
            Generierte Texte werden automatisch gespeichert.
          </p>
        </div>
      )}

      <LoadTextConfirmModal
        isOpen={isModalOpen}
        title={selectedText?.title || ''}
        onConfirm={handleConfirmLoad}
        onCancel={handleCancelLoad}
      />
    </section>
  );
};

export default React.memo(RecentTextsSection);
