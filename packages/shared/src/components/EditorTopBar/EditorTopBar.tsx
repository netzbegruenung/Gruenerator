import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';

import './EditorTopBar.css';

interface EditorTopBarProps {
  title?: string;
  connectionStatus?: 'connected' | 'syncing' | 'disconnected';
  onBack?: () => void;
  rightActions?: ReactNode;
  onTitleChange?: (newTitle: string) => void;
  editable?: boolean;
}

export const EditorTopBar = ({
  title,
  connectionStatus,
  onBack,
  rightActions,
  onTitleChange,
  editable = false,
}: EditorTopBarProps) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(title || '');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setEditValue(title || '');
  }, [title]);

  useEffect(() => {
    if (isEditing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [isEditing]);

  const commitEdit = useCallback(() => {
    setIsEditing(false);
    const trimmed = editValue.trim();
    const newTitle = trimmed || 'Unbenannt';
    if (newTitle !== (title || 'Unbenannt')) {
      onTitleChange?.(newTitle);
    }
  }, [editValue, title, onTitleChange]);

  const cancelEdit = useCallback(() => {
    setEditValue(title || '');
    setIsEditing(false);
  }, [title]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        commitEdit();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        cancelEdit();
      }
    },
    [commitEdit, cancelEdit]
  );

  const canEditTitle = editable && !!onTitleChange;

  return (
    <header className="editor-topbar">
      <div className="editor-topbar__left">
        {onBack && (
          <button className="glass-btn" onClick={onBack} aria-label="Zurück">
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="19" y1="12" x2="5" y2="12" />
              <polyline points="12 19 5 12 12 5" />
            </svg>
          </button>
        )}
        {title != null && (
          <>
            <span className="glass-divider editor-topbar__divider" />
            {isEditing ? (
              <input
                ref={inputRef}
                className="editor-topbar__title-input"
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onBlur={commitEdit}
                onKeyDown={handleKeyDown}
                aria-label="Dokumenttitel bearbeiten"
              />
            ) : (
              <h1
                className={`editor-topbar__title${canEditTitle ? ' editor-topbar__title--editable' : ''}`}
                onClick={canEditTitle ? () => setIsEditing(true) : undefined}
                title={canEditTitle ? 'Klicken zum Umbenennen' : undefined}
              >
                {title || 'Unbenannt'}
              </h1>
            )}
          </>
        )}
        {connectionStatus && <div className={`status-dot ${connectionStatus}`} />}
      </div>

      {rightActions && <div className="editor-topbar__right">{rightActions}</div>}
    </header>
  );
};
