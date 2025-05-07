import React, { useState, useCallback, useRef, useEffect } from 'react';
import PropTypes from 'prop-types';
import { HiPlus, HiX, HiChevronDown, HiChevronUp } from 'react-icons/hi';
import './style.css';

/**
 * Komponente zur Auswahl von Wissensbausteinen.
 */
const KnowledgeSelector = ({ 
  onSelect, 
  selectedKnowledge = [], 
  availableKnowledge = [], 
  isDisabled = false 
}) => {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);

  const handleToggleDropdown = useCallback(() => {
    if (isDisabled) return;
    setIsDropdownOpen(prev => !prev);
  }, [isDisabled]);

  const handleAddKnowledge = useCallback((knowledge) => {
    if (isDisabled) return;
    onSelect(knowledge, null);
    setIsDropdownOpen(false); // Close dropdown after selection
  }, [onSelect, isDisabled]);

  const handleRemoveKnowledge = useCallback((knowledgeId) => {
    if (isDisabled) return;
    onSelect(null, knowledgeId);
  }, [onSelect, isDisabled]);

  // Filter available knowledge to show only unselected items
  const unselectedKnowledge = availableKnowledge.filter(
    available => !selectedKnowledge.some(selected => selected.id === available.id)
  );

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  return (
    <div className="knowledge-selector">
      <div className="selected-knowledge-container">
        {selectedKnowledge.map(item => (
          <div key={item.id} className="knowledge-tag">
            <span>{item.title}</span>
            <button 
              onClick={() => handleRemoveKnowledge(item.id)} 
              className="remove-knowledge-btn"
              disabled={isDisabled}
              aria-label={`Wissen entfernen: ${item.title}`}
              type="button"
            >
              <HiX />
            </button>
          </div>
        ))}
      </div>

      <div className="knowledge-selector-controls" ref={dropdownRef}>
        <button 
          className="add-knowledge-btn" 
          onClick={handleToggleDropdown} 
          disabled={isDisabled || unselectedKnowledge.length === 0}
          type="button"
        >
          <HiPlus /> 
          <span>Wissen hinzufügen</span>
          {isDropdownOpen ? <HiChevronUp /> : <HiChevronDown />}
        </button>
        
        {isDropdownOpen && unselectedKnowledge.length > 0 && (
          <div className="knowledge-dropdown">
            <ul>
              {unselectedKnowledge.map(item => (
                <li key={item.id} onClick={() => handleAddKnowledge(item)}>
                  {item.title}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {isDisabled && <p className="disabled-message">Laden...</p>}
    </div>
  );
};

KnowledgeSelector.propTypes = {
  /** Funktion, die bei Auswahl/Abwahl aufgerufen wird. (knowledgeToAdd, knowledgeIdToRemove) */
  onSelect: PropTypes.func.isRequired,
  /** Array der aktuell ausgewählten Wissens-Objekte */
  selectedKnowledge: PropTypes.arrayOf(PropTypes.shape({
    id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
    title: PropTypes.string.isRequired,
    content: PropTypes.string
  })),
  /** Array aller verfügbaren Wissens-Objekte */
  availableKnowledge: PropTypes.arrayOf(PropTypes.shape({
    id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
    title: PropTypes.string.isRequired,
    content: PropTypes.string
  })),
  /** Ob die Komponente deaktiviert ist (z.B. während des Ladens) */
  isDisabled: PropTypes.bool
};

export default KnowledgeSelector; 