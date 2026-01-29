import { useEffect, useCallback, type ReactNode, type ComponentType } from 'react';
import { type IconBaseProps } from 'react-icons';
import './ActionSheet.css';

interface ActionSheetItemProps {
  icon?: ComponentType<IconBaseProps>;
  label: string;
  description?: string;
  badge?: string;
  onClick: () => void;
}

interface ActionSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children?: ReactNode;
}

export const ActionSheetItem = ({
  icon: Icon,
  label,
  description,
  badge,
  onClick,
}: ActionSheetItemProps) => {
  const handleClick = () => {
    onClick();
  };

  return (
    <button className="action-sheet-item" onClick={handleClick}>
      {Icon && (
        <span className="action-sheet-item-icon">
          <Icon />
        </span>
      )}
      <span className="action-sheet-item-content">
        <span className="action-sheet-item-label">{label}</span>
        {description && <span className="action-sheet-item-description">{description}</span>}
      </span>
      {badge && <span className="action-sheet-item-badge">{badge}</span>}
    </button>
  );
};

export const ActionSheetDivider = () => {
  return <div className="action-sheet-divider" />;
};

export const ActionSheet = ({ isOpen, onClose, title, children }: ActionSheetProps) => {
  const handleEscape = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    },
    [onClose]
  );

  const handleBackdropClick = useCallback(() => {
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = '';
    };
  }, [isOpen, handleEscape]);

  return (
    <>
      <div
        className={`action-sheet-overlay ${isOpen ? 'open' : ''}`}
        onClick={handleBackdropClick}
        aria-hidden="true"
      />
      <div
        className={`action-sheet ${isOpen ? 'open' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={title || 'Actions'}
      >
        <div className="action-sheet-handle" />
        <div className="action-sheet-content">
          {title && <h2 className="action-sheet-title">{title}</h2>}
          <div className="action-sheet-items">{children}</div>
          <button className="action-sheet-cancel" onClick={onClose}>
            Abbrechen
          </button>
        </div>
      </div>
    </>
  );
};
