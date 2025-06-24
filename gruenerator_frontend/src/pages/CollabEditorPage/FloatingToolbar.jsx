import React, { useState, useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import { HiOutlineClipboardCopy } from 'react-icons/hi';
import { FaUndo, FaRedo, FaUsers, FaEye, FaChevronDown } from 'react-icons/fa';
import { Tooltip } from 'react-tooltip';
import useCollabEditorStore from '../../stores/collabEditorStore';
import useDarkMode from '../../components/hooks/useDarkMode';
import ThemeToggleButton from '../../components/layout/Header/ThemeToggleButton';
import ClipboardFeedbackIcon from '../../components/common/UI/ClipboardFeedbackIcon';

const FloatingToolbar = ({ documentId, isPreviewMode = false }) => {
  const [copied, setCopied] = useState(false);
  const [shareDropdownOpen, setShareDropdownOpen] = useState(false);
  const [shareType, setShareType] = useState(null); // 'collab' or 'preview'
  const dropdownRef = useRef(null);
  const { connectionStatus, canUndo, canRedo, undo, redo, canUndoState, canRedoState } = useCollabEditorStore();
  const [darkMode, toggleDarkMode] = useDarkMode();

  // Get history status directly from store state (reactive)
  const historyStatus = {
    canUndo: canUndoState,
    canRedo: canRedoState
  };


  const handleUndo = () => {
    if (historyStatus.canUndo) {
      undo();
    }
  };

  const handleRedo = () => {
    if (historyStatus.canRedo) {
      redo();
    }
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setShareDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const generateShareLink = (type) => {
    const baseUrl = window.location.origin;
    if (type === 'preview') {
      return `${baseUrl}/editor/collab/${documentId}/preview`;
    } else {
      return `${baseUrl}/editor/collab/${documentId}`;
    }
  };

  const copyShareLink = async (type) => {
    try {
      const link = generateShareLink(type);
      await navigator.clipboard.writeText(link);
      setShareType(type);
      setCopied(true);
      setShareDropdownOpen(false);
      setTimeout(() => {
        setCopied(false);
        setShareType(null);
      }, 2000);
    } catch (err) {
      console.error('Fehler beim Kopieren in die Zwischenablage:', err);
    }
  };

  const toggleShareDropdown = () => {
    setShareDropdownOpen(!shareDropdownOpen);
  };

  if (!documentId) {
    return null;
  }

  return (
    <div className="floating-toolbar">
      <div className="floating-toolbar-actions">
        <button
          onClick={handleUndo}
          className={`floating-toolbar-button ${!historyStatus.canUndo ? 'floating-toolbar-button-disabled' : ''}`}
          disabled={!historyStatus.canUndo}
          data-tooltip-id="floating-undo-tooltip"
          data-tooltip-content="Rückgängig machen"
          aria-label="Letzte Änderung rückgängig machen"
        >
          <FaUndo size={18} />
        </button>
        <Tooltip id="floating-undo-tooltip" place="left" effect="solid" />

        <button
          onClick={handleRedo}
          className={`floating-toolbar-button ${!historyStatus.canRedo ? 'floating-toolbar-button-disabled' : ''}`}
          disabled={!historyStatus.canRedo}
          data-tooltip-id="floating-redo-tooltip"
          data-tooltip-content="Wiederholen"
          aria-label="Letzte rückgängig gemachte Änderung wiederholen"
        >
          <FaRedo size={18} />
        </button>
        <Tooltip id="floating-redo-tooltip" place="left" effect="solid" />

        <ThemeToggleButton darkMode={darkMode} toggleDarkMode={toggleDarkMode} className="floating-toolbar-button" />

        {/* Share Dropdown */}
        <div className="share-dropdown-container" ref={dropdownRef}>
          <button 
            onClick={toggleShareDropdown}
            className={`floating-toolbar-button ${copied ? 'floating-toolbar-button-success' : ''} ${shareDropdownOpen ? 'dropdown-active' : ''}`}
            aria-label="Sharing-Optionen"
            aria-expanded={shareDropdownOpen}
            aria-haspopup="true"
          >
            {copied ? (
              <ClipboardFeedbackIcon copied={copied} iconSize={18} />
            ) : (
              <>
                <HiOutlineClipboardCopy size={18} />
                <FaChevronDown size={10} className="dropdown-arrow" />
              </>
            )}
          </button>
          
          {shareDropdownOpen && (
            <div className="share-dropdown-menu">
              <button
                onClick={() => copyShareLink('collab')}
                className="share-dropdown-item"
                disabled={isPreviewMode}
              >
                <FaUsers size={16} />
                <div className="share-option-content">
                  <span className="share-option-title">Kollaborationslink</span>
                  <span className="share-option-desc">Vollzugriff zum Bearbeiten</span>
                </div>
              </button>
              
              <button
                onClick={() => copyShareLink('preview')}
                className="share-dropdown-item"
              >
                <FaEye size={16} />
                <div className="share-option-content">
                  <span className="share-option-title">Vorschaulink</span>
                  <span className="share-option-desc">Nur Lesen und Kommentieren</span>
                </div>
              </button>
            </div>
          )}
        </div>
      </div>
      
      <div className="floating-toolbar-status">
        <span className={`connection-dot connection-status-${connectionStatus}`} />
      </div>
    </div>
  );
};

FloatingToolbar.propTypes = {
  documentId: PropTypes.string.isRequired,
  isPreviewMode: PropTypes.bool,
};

export default FloatingToolbar;