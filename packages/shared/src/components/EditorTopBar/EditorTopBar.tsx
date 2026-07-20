import { type ReactNode } from 'react';

import { EditableTitle } from '../EditableTitle';

import './EditorTopBar.css';

interface EditorTopBarProps {
  title?: string;
  connectionStatus?: 'connected' | 'syncing' | 'disconnected' | 'offline-cached';
  onBack?: () => void;
  rightActions?: ReactNode;
  onTitleChange?: (newTitle: string) => void;
  editable?: boolean;
  /** Anchor for product tours — scoped per editor since this bar is shared. */
  dataTour?: string;
}

export const EditorTopBar = ({
  title,
  connectionStatus,
  onBack,
  rightActions,
  onTitleChange,
  editable = false,
  dataTour,
}: EditorTopBarProps) => {
  return (
    <header className="editor-topbar" data-tour={dataTour}>
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
            <EditableTitle
              title={title}
              editable={editable}
              onTitleChange={onTitleChange}
              className="editor-topbar__title"
              editableClassName="editor-topbar__title--editable"
              inputClassName="editor-topbar__title-input"
              ariaLabel="Dokumenttitel bearbeiten"
              as="h1"
            />
          </>
        )}
        {connectionStatus && (
          <>
            <div className={`status-dot ${connectionStatus}`} />
            <span className="status-label">
              {connectionStatus === 'connected' && 'Gespeichert'}
              {connectionStatus === 'syncing' && 'Speichert...'}
              {connectionStatus === 'disconnected' && 'Offline'}
              {connectionStatus === 'offline-cached' && 'Lokal gespeichert'}
            </span>
          </>
        )}
      </div>

      {rightActions && <div className="editor-topbar__right">{rightActions}</div>}
    </header>
  );
};
