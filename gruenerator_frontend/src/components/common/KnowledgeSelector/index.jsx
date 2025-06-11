import React, { useContext, useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { FormContext } from '../../utils/FormContext';
import FormSelect from '../Form/Input/FormSelect';
// Removed: import './style.css';
// Removed: import { HiPlus, HiX } from 'react-icons/hi';
// Removed: import useKnowledge from '../../hooks/useKnowledge';

/**
 * KnowledgeSelector-Komponente zur Anzeige und Auswahl von Wissen.
 */
const KnowledgeSelector = ({ 
  availableKnowledge = [], 
  onKnowledgeSelection, 
  disabled = false,
  enableSelection = false 
}) => {
  const { knowledgeSourceConfig } = useContext(FormContext);
  const { type: sourceType, name: sourceName, loadedKnowledgeItems } = knowledgeSourceConfig || {};
  
  const [selectedKnowledgeId, setSelectedKnowledgeId] = useState('');

  // Convert available knowledge to FormSelect options
  const knowledgeOptions = availableKnowledge.map(item => ({
    value: item.id,
    label: item.title
  }));

  const handleKnowledgeChange = (knowledgeId) => {
    setSelectedKnowledgeId(knowledgeId);
    if (onKnowledgeSelection && knowledgeId) {
      const selectedItem = availableKnowledge.find(item => item.id === knowledgeId);
      if (selectedItem) {
        onKnowledgeSelection(selectedItem);
      }
    }
  };

  // Reset selection when available knowledge changes
  useEffect(() => {
    setSelectedKnowledgeId('');
  }, [availableKnowledge]);

  if (sourceType === 'neutral' || !loadedKnowledgeItems || loadedKnowledgeItems.length === 0) {
    return null;
  }

  return (
    <div>
      {/* Display loaded knowledge items */}
      {loadedKnowledgeItems && loadedKnowledgeItems.length > 0 && (
        <div style={{ marginBottom: 'var(--spacing-medium)' }}>
          <div style={{ 
            display: 'flex', 
            flexWrap: 'wrap', 
            gap: 'var(--spacing-xsmall)' 
          }}>
            {loadedKnowledgeItems.map((item) => (
              <span 
                key={item.id || item.title} 
                style={{
                  background: 'var(--background-color-alt)',
                  color: 'var(--font-color)',
                  padding: 'var(--spacing-xxsmall) var(--spacing-xsmall)',
                  borderRadius: 'var(--card-border-radius-small)',
                  fontSize: '0.875rem',
                  border: 'var(--border-subtle)'
                }}
              >
                {item.title}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Knowledge selection with FormSelect - use it directly without wrapper */}
      {enableSelection && knowledgeOptions.length > 0 && (
        <FormSelect
          name="knowledge-selection"
          label="Wissen hinzufügen"
          options={knowledgeOptions}
          placeholder="Wissen auswählen..."
          disabled={disabled}
          value={selectedKnowledgeId}
          onChange={(e) => handleKnowledgeChange(e.target.value)}
        />
      )}

      {/* Show message when no knowledge is available for selection */}
      {enableSelection && knowledgeOptions.length === 0 && !disabled && (
        <p style={{ 
          color: 'var(--font-color-disabled)', 
          fontSize: '0.875rem',
          margin: 'var(--spacing-small) 0'
        }}>
          Kein Wissen verfügbar für die aktuelle Auswahl.
        </p>
      )}
    </div>
  );
};

KnowledgeSelector.propTypes = {
  availableKnowledge: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
      title: PropTypes.string.isRequired
    })
  ),
  onKnowledgeSelection: PropTypes.func,
  disabled: PropTypes.bool,
  enableSelection: PropTypes.bool
};

export default KnowledgeSelector; 