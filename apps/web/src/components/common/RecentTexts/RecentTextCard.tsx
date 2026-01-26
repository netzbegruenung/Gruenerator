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
      className="form-card form-card--small recent-card"
      onClick={handleCardClick}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={0}
      aria-label={`Text laden: ${text.title}`}
    >
      {onDelete && (
        <button
          className="recent-card__delete"
          onClick={handleDelete}
          disabled={isDeleting}
          aria-label="Löschen"
        >
          <HiX size={14} />
        </button>
      )}

      <h4 className="recent-card__title">{text.title}</h4>
      {preview && <p className="recent-card__preview">{preview}</p>}
    </article>
  );
};

export default React.memo(RecentTextCard);
