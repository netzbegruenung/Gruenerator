import React, { useState } from 'react';
import { HiX } from 'react-icons/hi';

import { createTextPreview } from '../../../utils/textPreview';

import type { SavedText } from '../../../hooks/useRecentTexts';

export interface RecentTextCardProps {
  text: SavedText;
  onSelect: (text: SavedText) => void;
  onDelete?: (id: string) => Promise<void>;
}

const RecentTextCard: React.FC<RecentTextCardProps> = ({ text, onSelect, onDelete }) => {
  const [isDeleting, setIsDeleting] = useState(false);
  const preview = createTextPreview(text.content, 100);

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!onDelete) return;

    const confirmDelete = window.confirm(`"${text.title}" wirklich löschen?`);
    if (!confirmDelete) return;

    setIsDeleting(true);
    try {
      await onDelete(text.id);
    } catch (error) {
      console.error('Error deleting text:', error);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleCardClick = () => {
    if (!isDeleting) onSelect(text);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleCardClick();
    }
  };

  return (
    <article
      className="group relative flex-1 min-w-0 max-md:flex-none cursor-pointer bg-background-alt border border-grey-200 dark:border-grey-700 rounded-md p-md shadow-sm transition-all duration-250 overflow-hidden hover:border-primary-400"
      onClick={handleCardClick}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={0}
      aria-label={`Text laden: ${text.title}`}
    >
      {onDelete && (
        <button
          className="absolute top-xs right-xs size-5 flex items-center justify-center rounded-full bg-transparent border-none text-grey-400 opacity-0 max-md:opacity-60 group-hover:opacity-100 cursor-pointer transition-opacity duration-150 hover:text-red-500"
          onClick={handleDelete}
          disabled={isDeleting}
          aria-label="Löschen"
        >
          <HiX size={14} />
        </button>
      )}

      <h4 className="text-[0.8125rem] font-semibold text-foreground-heading m-0 mb-[2px] pr-md truncate">
        {text.title}
      </h4>
      {preview && <p className="text-xs text-grey-500 m-0 truncate">{preview}</p>}
    </article>
  );
};

export default React.memo(RecentTextCard);
