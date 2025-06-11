import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { HiOutlineClipboardCopy } from 'react-icons/hi';
import { FaUndo, FaRedo } from 'react-icons/fa';
import { Tooltip } from 'react-tooltip';
import { useCollabEditor } from '../../context/CollabEditorContext';
import useDarkMode from '../../components/hooks/useDarkMode';
import ThemeToggleButton from '../../components/layout/Header/ThemeToggleButton';
import ClipboardFeedbackIcon from '../../components/common/UI/ClipboardFeedbackIcon';

const CollabHeader = ({ documentId }) => {
  const [copied, setCopied] = useState(false);
  const { quillInstance, connectionStatus } = useCollabEditor();
  const [darkMode, toggleDarkMode] = useDarkMode();
  const [historyStatus, setHistoryStatus] = useState({ canUndo: false, canRedo: false });

  useEffect(() => {
    if (quillInstance) {
      const updateHistoryStatus = () => {
        if (quillInstance.history) {
          setHistoryStatus({
            canUndo: quillInstance.history.stack.undo.length > 0,
            canRedo: quillInstance.history.stack.redo.length > 0,
          });
        } else {
          setHistoryStatus({ canUndo: false, canRedo: false });
        }
      };

      updateHistoryStatus();
      quillInstance.on('text-change', updateHistoryStatus);

      return () => {
        quillInstance.off('text-change', updateHistoryStatus);
      };
    }
  }, [quillInstance]);

  const handleUndo = () => {
    if (quillInstance && historyStatus.canUndo) {
      quillInstance.history.undo();
    }
  };

  const handleRedo = () => {
    if (quillInstance && historyStatus.canRedo) {
      quillInstance.history.redo();
    }
  };

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000); // Reset nach 2 Sekunden
    } catch (err) {
      console.error('Fehler beim Kopieren in die Zwischenablage:', err);
      // Hier könnte eine Fehlermeldung für den User angezeigt werden
    }
  };

  return (
    <header className="collab-editor-header">
      <div className="collab-editor-logo">Grünerator Editor</div>

      <div className="collab-header-right-group">
        {documentId && (
          <div className="collab-editor-actions">
            <button
              onClick={handleUndo}
              className={`collab-editor-button ${!historyStatus.canUndo ? 'collab-editor-button-disabled' : ''}`}
              disabled={!historyStatus.canUndo}
              data-tooltip-id="collab-undo-tooltip"
              data-tooltip-content="Rückgängig machen"
              aria-label="Letzte Änderung rückgängig machen"
            >
              <FaUndo size={18} />
            </button>
            <Tooltip id="collab-undo-tooltip" place="bottom" effect="solid" />

            <button
              onClick={handleRedo}
              className={`collab-editor-button ${!historyStatus.canRedo ? 'collab-editor-button-disabled' : ''}`}
              disabled={!historyStatus.canRedo}
              data-tooltip-id="collab-redo-tooltip"
              data-tooltip-content="Wiederholen"
              aria-label="Letzte rückgängig gemachte Änderung wiederholen"
            >
              <FaRedo size={18} />
            </button>
            <Tooltip id="collab-redo-tooltip" place="bottom" effect="solid" />

            <ThemeToggleButton darkMode={darkMode} toggleDarkMode={toggleDarkMode} className="collab-editor-button" />

            <button 
              onClick={copyToClipboard}
              className={`collab-editor-button ${copied ? 'collab-editor-button-success' : ''}`}
              aria-label={copied ? "Link in Zwischenablage kopiert" : "Link in Zwischenablage kopieren"}
            >
              <ClipboardFeedbackIcon copied={copied} iconSize={18} />
            </button>
          </div>
        )}
        <div className="collab-editor-status-indicator">
          <span className={`connection-dot connection-status-${connectionStatus}`} />
        </div>
      </div>
    </header>
  );
};

CollabHeader.propTypes = {
  documentId: PropTypes.string.isRequired,
};

export default CollabHeader;