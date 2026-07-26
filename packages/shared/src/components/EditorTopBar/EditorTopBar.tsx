import { useEffect, useRef, useState, type ReactNode } from 'react';

import { useIsBreakpoint } from '../../hooks/useMediaQuery';
import { EditableTitle } from '../EditableTitle';

import './EditorTopBar.css';

interface EditorTopBarProps {
  title?: string;
  connectionStatus?: 'connected' | 'syncing' | 'disconnected' | 'offline-cached';
  onBack?: () => void;
  rightActions?: ReactNode;
  /**
   * Secondary actions. On desktop they render inline before `rightActions`; on a
   * phone they collapse into a "Mehr"-sheet so the bar can never overflow.
   * Editors that pass nothing keep the previous behaviour exactly.
   */
  overflowActions?: ReactNode;
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
  overflowActions,
  onTitleChange,
  editable = false,
  dataTour,
}: EditorTopBarProps) => {
  // 768 matches the editors' own mobile layout switch, so the bar collapses
  // before the 640–767 band where a full action set would still overflow.
  const isMobile = useIsBreakpoint('max', 768);
  const [overflowOpen, setOverflowOpen] = useState(false);
  const collapse = isMobile && !!overflowActions;

  // A resize back to desktop must not leave the sheet orphaned on screen.
  useEffect(() => {
    if (!collapse) setOverflowOpen(false);
  }, [collapse]);

  const sheetRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!overflowOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOverflowOpen(false);
    };
    document.addEventListener('keydown', onKey);
    sheetRef.current?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [overflowOpen]);

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

      {(rightActions || overflowActions) && (
        <div className="editor-topbar__right">
          {!collapse && overflowActions}
          {rightActions}
          {collapse && (
            <button
              type="button"
              className={`glass-btn ${overflowOpen ? 'active' : ''}`}
              onClick={() => setOverflowOpen((v) => !v)}
              aria-label="Weitere Aktionen"
              aria-expanded={overflowOpen}
              title="Weitere Aktionen"
            >
              <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <circle cx="5" cy="12" r="2" />
                <circle cx="12" cy="12" r="2" />
                <circle cx="19" cy="12" r="2" />
              </svg>
            </button>
          )}
        </div>
      )}

      {collapse && overflowOpen && (
        <>
          <div
            className="editor-topbar__overflow-backdrop"
            onClick={() => setOverflowOpen(false)}
            aria-hidden="true"
          />
          <div
            ref={sheetRef}
            role="dialog"
            aria-label="Weitere Aktionen"
            tabIndex={-1}
            className="editor-topbar__overflow-sheet"
            // Any action inside closes the sheet — every entry is a one-shot
            // command, so keeping it open would just hide the result.
            onClick={() => setOverflowOpen(false)}
          >
            <div className="editor-topbar__overflow-grip" aria-hidden="true" />
            <div className="editor-topbar__overflow-actions">{overflowActions}</div>
          </div>
        </>
      )}
    </header>
  );
};
