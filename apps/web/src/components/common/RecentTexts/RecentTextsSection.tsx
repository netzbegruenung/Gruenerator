import React, { useState, useCallback } from 'react';

import { useRecentTexts, type SavedText } from '../../../hooks/useRecentTexts';
import LoadTextConfirmModal from '../Modals/LoadTextConfirmModal';

import RecentTextCard from './RecentTextCard';

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
    <section
      className="mt-xl w-full max-w-[800px] mx-auto xl:max-w-[900px] 3xl:max-w-[1000px] max-md:px-sm"
      aria-labelledby="recent-texts-heading"
    >
      <h3
        id="recent-texts-heading"
        className="text-xs font-medium text-grey-500 uppercase tracking-wide m-0 mb-sm text-center"
      >
        Zuletzt erstellt
      </h3>

      {isLoading && (
        <div className="flex gap-sm max-md:flex-col">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="flex-1 min-w-0 h-[52px] bg-grey-100 dark:bg-grey-800 rounded-md animate-pulse"
            />
          ))}
        </div>
      )}

      {!isLoading && !error && texts.length > 0 && (
        <div className="flex gap-sm max-md:flex-col">
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

      {error && <p className="text-xs text-red-500 text-center">Fehler beim Laden</p>}

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
