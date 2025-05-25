import React, { useContext } from 'react';
import PropTypes from 'prop-types';
import { FormContext } from '../../utils/FormContext';
import './style.css';
// Removed: import { HiPlus, HiX } from 'react-icons/hi';
// Removed: import useKnowledge from '../../hooks/useKnowledge';

/**
 * KnowledgeSelector-Komponente zur Anzeige des aktuell ausgewählten Wissens.
 * Das Wissen wird zentral im FormContext basierend auf der Auswahl in BaseForm verwaltet.
 */
const KnowledgeSelector = () => {
  const { knowledgeSourceConfig } = useContext(FormContext);
  const { type: sourceType, name: sourceName, loadedKnowledgeItems } = knowledgeSourceConfig || {};

  // Removed: useKnowledge hook call and related state/handlers for local selection
  // (availableKnowledge, selectedKnowledge, isLoading, handleKnowledgeSelection, clearSelectedKnowledge)

  if (sourceType === 'neutral' || !loadedKnowledgeItems || loadedKnowledgeItems.length === 0) {
    return (
      <div className="knowledge-selector-display-only">
        {/* Optional: Display a message if nothing is loaded, or render nothing.
            For now, rendering nothing to keep it clean if no knowledge is active.
            If a message is preferred, it could be:
            <p className="no-knowledge">Kein spezifisches Wissen für die aktuelle Auswahl geladen.</p> 
        */}
      </div>
    );
  }

  return (
    <div className="knowledge-selector-display-only">
      {/* Removed heading, as the source selection is now above in BaseForm */}
      {/* <h4>Wissen aus Quelle: {sourceName || sourceType}</h4> */}
      {loadedKnowledgeItems && loadedKnowledgeItems.length > 0 && (
        <div className="loaded-knowledge-container">
          {loadedKnowledgeItems.map((item) => (
            <span key={item.id || item.title} className="knowledge-tag-display">
              {item.title}
            </span>
          ))}
        </div>
      )}
      {/* Removed UI elements for adding/selecting knowledge, as this is now handled in BaseForm */}
    </div>
  );
};

KnowledgeSelector.propTypes = {
  // Props like enableKnowledgeSelector, onKnowledgeUpdate, etc., are removed
  // as the component is now a passive display driven by FormContext.
};

export default KnowledgeSelector; 