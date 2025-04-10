import React, { useState, useEffect } from 'react';

// Helper function to generate the sanitized name
const generateSanitizedName = (label) => {
  return label
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '');
};

const FieldEditorAssistant = ({ initialFieldData, onSave, onCancel, existingFieldNames = [] }) => {
  const [field, setField] = useState({
    label: '',
    name: '',
    type: 'text',
    placeholder: '',
    required: false,
  });
  const [error, setError] = useState(null);

  useEffect(() => {
    // Initialize with existing data if provided (for editing)
    if (initialFieldData) {
      setField({
          ...initialFieldData,
          // Ensure name is also initialized if passed
          name: initialFieldData.name || generateSanitizedName(initialFieldData.label || '')
      });
    } else {
      // Reset for adding a new field
      setField({
        label: '',
        name: '',
        type: 'text',
        placeholder: '',
        required: false,
      });
    }
    setError(null); // Clear errors when component initializes or data changes
  }, [initialFieldData]); // Re-run when initial data changes

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    const newValue = type === 'checkbox' ? checked : value;

    setField(prevField => {
      const updatedField = { ...prevField, [name]: newValue };

      // Auto-generate technical name when label changes
      if (name === 'label') {
        updatedField.name = generateSanitizedName(newValue);
        // Simple suggestion logic (can be expanded)
        if (updatedField.type === 'text' && (newValue.includes('beschreibung') || newValue.includes('text'))) {
            updatedField.type = 'textarea';
        }
         if (updatedField.required === false && (newValue.toLowerCase().includes('email') || newValue.toLowerCase().includes('name') || newValue.toLowerCase().includes('titel'))) {
            updatedField.required = true;
        }
      }

      return updatedField;
    });
    setError(null); // Clear error on any change
  };

  const handleTypeChange = (newType) => {
      setField(prev => ({ ...prev, type: newType }));
  }

  const handleSaveClick = () => {
    setError(null);

    // Basic Validation
    if (!field.label.trim()) {
      setError('Das Label darf nicht leer sein.');
      return;
    }
    if (!field.name) { // Should not happen if label is set, but check anyway
        setError('Technischer Name konnte nicht generiert werden. Label prüfen.');
        return;
    }
    // Check for duplicate technical names (excluding the initial name if editing)
    const otherFieldNames = initialFieldData 
        ? existingFieldNames.filter(name => name !== initialFieldData.name)
        : existingFieldNames;
        
    if (otherFieldNames.includes(field.name)) {
        setError(`Der technische Name '${field.name}' wird bereits von einem anderen Feld verwendet.`);
        return;
    }

    onSave(field);
  };

  return (
    <div className="field-editor-assistant p-3 mb-3 border rounded"> 
      <h5>Feld bearbeiten/hinzufügen</h5>
      {error && <div className="alert alert-danger">{error}</div>}

      {/* Label Input */}
      <div className="form-group">
        <label className="white-text">Was soll im Formular stehen?</label>
        <input
          type="text"
          name="label"
          className="form-control"
          value={field.label}
          onChange={handleChange}
          placeholder="z.B. Thema des Artikels"
          required
        />
      </div>

      {/* Type Selection - Replaced Radio Buttons with Toggle Buttons */}
       <div className="form-group">
        <label className="white-text">Feld-Typ</label>
        <div className="type-selector-container" role="radiogroup" aria-labelledby="type-label">
            {/* Add an invisible label for screen readers if needed, or ensure the visible label is associated */}
            {/* <span id="type-label" className="visually-hidden">Feld-Typ</span> */}
            <button 
              type="button"
              className={`btn type-selector-button ${field.type === 'text' ? 'active' : ''}`}
              onClick={() => handleTypeChange('text')}
              aria-pressed={field.type === 'text'}
            >
                Kurzer Text
            </button>
            <button 
              type="button"
              className={`btn type-selector-button ${field.type === 'textarea' ? 'active' : ''}`}
              onClick={() => handleTypeChange('textarea')}
              aria-pressed={field.type === 'textarea'}
            >
                Langer Text
            </button>
        </div>
      </div>

      {/* Placeholder Input */}
      <div className="form-group">
        <label className="white-text">Hilfetext im Feld (optional)</label>
        <input
          type="text"
          name="placeholder"
          className="form-control"
          value={field.placeholder}
          onChange={handleChange}
          placeholder="z.B. Gib hier das Hauptthema an"
        />
      </div>

      {/* Required Checkbox - Replaced with Toggle Switch */}
       <div className="form-group toggle-switch-group">
          {/* Keep the label text */}
           <label className="form-check-label white-text" htmlFor="assistant-required-toggle">
               Muss dieses Feld ausgefüllt werden? (Pflichtfeld)
           </label>
           {/* Toggle Switch Structure */}
           <button 
              type="button" 
              role="switch"
              aria-checked={field.required}
              id="assistant-required-toggle"
              className={`toggle-switch ${field.required ? 'checked' : ''}`}
              onClick={() => setField(prev => ({ ...prev, required: !prev.required }))}
           >
               <span className="toggle-switch-thumb"></span>
           </button>
      </div>

      {/* Action Buttons */}
      <div className="action-button-container">
          <button type="button" onClick={onCancel} className="btn btn-tanne-bordered">
              Abbrechen
          </button>
           <button 
             type="button"
             className="btn btn-primary"
             onClick={handleSaveClick}
           >
              Feld speichern
           </button>
      </div>
    </div>
  );
};

export default FieldEditorAssistant; 