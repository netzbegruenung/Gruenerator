import type { ReactNode } from 'react';

import './EditorTopBar.css';

interface EditorTopBarProps {
  title?: string;
  connectionStatus?: 'connected' | 'syncing' | 'disconnected';
  onBack?: () => void;
  rightActions?: ReactNode;
}

export const EditorTopBar = ({
  title,
  connectionStatus,
  onBack,
  rightActions,
}: EditorTopBarProps) => {
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
            <h1 className="editor-topbar__title">{title || 'Unbenannt'}</h1>
          </>
        )}
        {connectionStatus && <div className={`status-dot ${connectionStatus}`} />}
      </div>

      {rightActions && <div className="editor-topbar__right">{rightActions}</div>}
    </header>
  );
};
