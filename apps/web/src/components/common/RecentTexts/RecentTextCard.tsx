import React, { useState } from 'react';
import { HiX, HiCalendar, HiDocumentText } from 'react-icons/hi';
import type { SavedText } from '../../../hooks/useRecentTexts';
import { formatRelativeDate } from '../../../utils/dateFormatter';
import { createTextPreview } from '../../../utils/textPreview';

export interface RecentTextCardProps {
  text: SavedText;
  onSelect: (text: SavedText) => void;
  onDelete?: (id: string) => Promise<void>;
  className?: string;
}

/**
 * Individual card for displaying a recent text
 * Shows title, preview, date, and word count
 */
const RecentTextCard: React.FC<RecentTextCardProps> = ({
  text,
  onSelect,
  onDelete,
  className = ''
}) => {
  const [isDeleting, setIsDeleting] = useState(false);

  const preview = createTextPreview(text.content, 150);

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();

    if (!onDelete) return;

    const confirmDelete = window.confirm(
      `Möchten Sie "${text.title}" wirklich löschen?`
    );

    if (!confirmDelete) return;

    setIsDeleting(true);

    try {
      await onDelete(text.id);
    } catch (error) {
      console.error('Error deleting text:', error);
      alert('Fehler beim Löschen. Bitte versuchen Sie es erneut.');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleCardClick = () => {
    if (!isDeleting) {
      onSelect(text);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleCardClick();
    }
  };

  return (
    <article
      className={`recent-text-card ${className}`}
      onClick={handleCardClick}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={0}
      aria-label={`Text laden: ${text.title}`}
    >
      {onDelete && (
        <button
          className="recent-text-card__delete"
          onClick={handleDelete}
          disabled={isDeleting}
          aria-label="Text löschen"
          title="Text löschen"
        >
          <HiX size={16} />
        </button>
      )}

      <h4 className="recent-text-card__title">{text.title}</h4>

      {preview && (
        <p className="recent-text-card__preview">{preview}</p>
      )}

      <div className="recent-text-card__meta">
        <span className="recent-text-card__date">
          <HiCalendar size={14} aria-hidden="true" />
          {formatRelativeDate(text.created_at)}
        </span>
        <span className="recent-text-card__stats">
          <HiDocumentText size={14} aria-hidden="true" />
          {text.word_count} Wörter
        </span>
      </div>
    </article>
  );
};

export default React.memo(RecentTextCard);
