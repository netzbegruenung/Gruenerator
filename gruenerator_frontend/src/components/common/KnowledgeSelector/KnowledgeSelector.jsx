import React, { useState, useEffect, useMemo, memo } from 'react';
import PropTypes from 'prop-types';
import FormSelect from '../Form/Input/FormSelect';
import { useGeneratorKnowledgeStore } from '../../../stores/core/generatorKnowledgeStore';

/**
 * KnowledgeSelector-Komponente zur Anzeige und Auswahl von Wissen.
 */
const KnowledgeSelector = ({ 
  onKnowledgeSelection, 
  disabled = false,
  enableSelection = false 
}) => {
  const { 
    source, 
    availableKnowledge, 
    selectedKnowledgeIds, 
    toggleSelection 
  } = useGeneratorKnowledgeStore();
  
  console.log('[KnowledgeSelector] Render with:', {
    source,
    availableKnowledge: availableKnowledge.length,
    selectedKnowledgeIds: selectedKnowledgeIds,
    enableSelection
  });
  
  const [selectedKnowledgeId, setSelectedKnowledgeId] = useState('');

  // Memoize expensive computations to prevent unnecessary re-renders
  const knowledgeOptions = useMemo(() => 
    availableKnowledge.map(item => ({
      value: item.id,
      label: item.title
    })), 
    [availableKnowledge]
  );

  const selectedKnowledgeItems = useMemo(() => 
    availableKnowledge.filter(item => 
      selectedKnowledgeIds.includes(item.id)
    ), 
    [availableKnowledge, selectedKnowledgeIds]
  );

  const handleKnowledgeChange = (knowledgeId) => {
    console.log('[KnowledgeSelector] handleKnowledgeChange called with ID:', knowledgeId);
    setSelectedKnowledgeId(knowledgeId);
    if (knowledgeId) {
      const selectedItem = availableKnowledge.find(item => item.id === knowledgeId);
      console.log('[KnowledgeSelector] Found selected item:', selectedItem);
      if (selectedItem) {
        console.log('[KnowledgeSelector] Calling toggleSelection with ID:', knowledgeId);
        toggleSelection(knowledgeId);
        if (onKnowledgeSelection) {
          console.log('[KnowledgeSelector] Calling onKnowledgeSelection callback');
          onKnowledgeSelection(selectedItem);
        }
      }
    }
  };

  // Reset selection when available knowledge changes
  useEffect(() => {
    setSelectedKnowledgeId('');
  }, [availableKnowledge]);

  if (source.type === 'neutral' || availableKnowledge.length === 0) {
    return null;
  }

  return (
    <div>
      {/* Display selected knowledge items */}
      {selectedKnowledgeItems.length > 0 && (
        <div style={{ marginBottom: 'var(--spacing-medium)' }}>
          <div style={{ 
            display: 'flex', 
            flexWrap: 'wrap', 
            gap: 'var(--spacing-xsmall)' 
          }}>
            {selectedKnowledgeItems.map((item) => (
              <span 
                key={item.id} 
                style={{
                  background: 'var(--background-color-alt)',
                  color: 'var(--font-color)',
                  padding: 'var(--spacing-xxsmall) var(--spacing-xsmall)',
                  borderRadius: 'var(--card-border-radius-small)',
                  fontSize: '0.875rem',
                  border: 'var(--border-subtle)',
                  cursor: 'pointer'
                }}
                onClick={() => toggleSelection(item.id)}
                title="Klicken zum Entfernen"
              >
                {item.title} ×
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Knowledge selection with FormSelect */}
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
  onKnowledgeSelection: PropTypes.func,
  disabled: PropTypes.bool,
  enableSelection: PropTypes.bool
};

KnowledgeSelector.displayName = 'KnowledgeSelector';

// Memoize the component to prevent unnecessary re-renders when props haven't changed
export default memo(KnowledgeSelector); 