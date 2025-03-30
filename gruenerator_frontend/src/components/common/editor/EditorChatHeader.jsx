import React from 'react';
import PropTypes from 'prop-types';
import { TbPencil, TbBrain, TbSearch } from "react-icons/tb";
import './EditorChatHeader.css';

const EditorChatHeader = ({ currentMode, onModeChange }) => {
  // Titel basierend auf dem Modus bestimmen
  const getHeaderTitle = () => {
    switch(currentMode) {
      case 'edit':
        return 'Editor - Textanpassung';
      case 'think':
        return 'Editor - Brainstorming';
      case 'search':
        return 'Editor - Websuche';
      default:
        return 'Editor';
    }
  };

  return (
    <div className="editor-chat-header">
      <h3>{getHeaderTitle()}</h3>
      <div className="chat-mode-selector">
        <button 
          className={`mode-button ${currentMode === 'edit' ? 'active' : ''}`}
          onClick={() => onModeChange('edit')}
          title="Edit-Modus"
        >
          <TbPencil />
        </button>
        <button 
          className={`mode-button ${currentMode === 'think' ? 'active' : ''}`}
          onClick={() => onModeChange('think')}
          title="Think-Modus"
        >
          <TbBrain />
        </button>
        <button 
          className={`mode-button ${currentMode === 'search' ? 'active' : ''}`}
          onClick={() => onModeChange('search')}
          title="Such-Modus"
        >
          <TbSearch />
        </button>
      </div>
    </div>
  );
};

EditorChatHeader.propTypes = {
  currentMode: PropTypes.oneOf(['edit', 'think', 'search']).isRequired,
  onModeChange: PropTypes.func.isRequired
};

export default EditorChatHeader; 