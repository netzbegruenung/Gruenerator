import React, { useState, useCallback } from 'react';

import { useRecentTexts, type SavedText } from '../../../hooks/useRecentTexts';
import LoadTextConfirmModal from '../Modals/LoadTextConfirmModal';

import RecentTextCard from './RecentTextCard';
import '../../../assets/styles/components/common/recent-texts.css';

export interface RecentTextsSectionProps {
  generatorType: string;
  onTextLoad: (content: string, metadata: unknown) => void;
}

const RecentTextsSection: React.FC<RecentTextsSectionProps> = ({ generatorType, onTextLoad }) => {
  const { texts, isLoading, error, deleteText } = useRecentTexts({
    generatorType,
    limit: 3,
    enabled: true,
  });

  const [selectedText, setSelectedText] = useState<SavedText | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const handleTextSelect = useCallback((text: SavedText) => {
    setSelectedText(text);
    setIsModalOpen(true);
  }, []);

  const handleConfirmLoad = useCallback(() => {
    if (selectedText) {
      onTextLoad(selectedText.content, {
        title: selectedText.title,
        contentType: selectedText.type,
        wordCount: selectedText.word_count,
      });
      setIsModalOpen(false);
      setSelectedText(null);
    }
  }, [selectedText, onTextLoad]);

  const handleCancelLoad = useCallback(() => {
    setIsModalOpen(false);
    setSelectedText(null);
  }, []);

  if (!isLoading && texts.length === 0 && !error) {
    return null;
  }

  return (
    <section className="recent-texts" aria-labelledby="recent-texts-heading">
      <h3 id="recent-texts-heading" className="recent-texts__heading">
        Zuletzt erstellt
      </h3>

      {isLoading && (
        <div className="recent-texts__grid">
          <div className="recent-card recent-card--skeleton" />
          <div className="recent-card recent-card--skeleton" />
          <div className="recent-card recent-card--skeleton" />
        </div>
      )}

      {!isLoading && !error && texts.length > 0 && (
        <div className="recent-texts__grid">
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

      {error && <p className="recent-texts__error">Fehler beim Laden</p>}

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
