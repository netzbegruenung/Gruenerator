import React, { useState } from 'react';
import BaseForm from '../../components/common/BaseForm';
import { youSupabaseUtils } from '../../components/utils/youSupabaseClient';
import { useNavigate } from 'react-router-dom';
import FieldEditorAssistant from './components/FieldEditorAssistant';

// Definiere die Schritte
const STEPS = {
  BASICS: 1,
  FIELDS: 2,
  PROMPT: 3,
  REVIEW: 4
};

const CreateCustomGeneratorPage = ({ showHeaderFooter = true }) => {
  const [currentStep, setCurrentStep] = useState(STEPS.BASICS);
  const [formData, setFormData] = useState({
    name: '',
    slug: '',
    fields: [],
    prompt: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const navigate = useNavigate();

  // State for managing the field editor assistant
  const [isEditingField, setIsEditingField] = useState(false);
  const [editingFieldIndex, setEditingFieldIndex] = useState(null); // null for new field, index for existing

  // Handler für einfache Eingabefelder (name, slug, prompt)
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    let processedValue = value;
    
    if (name === 'slug') {
      // Einfache Bereinigung für Slug: Kleinbuchstaben, Leerzeichen durch Bindestriche ersetzen
      processedValue = value
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-]/g, '');
    }

    setFormData(prev => ({ ...prev, [name]: processedValue }));
  };

  // Feldmanagement (Schritt 2)
  const handleFieldChange = (index, fieldData) => {
    const { label } = fieldData;
    let { name, type, required } = fieldData;

    // Generate technical name automatically from label
    const sanitizedName = label
      .toLowerCase()
      .replace(/\s+/g, '_')
      .replace(/[^a-z0-9_]/g, '');

    // Simple logic to suggest field type based on label (only if type is still default 'text')
    // This is a basic heuristic and might need refinement
    if (type === 'text' && (label.includes('beschreibung') || label.includes('text') || label.includes('inhalt') || label.includes('prompt') || label.includes('abschnitt'))) {
        type = 'textarea';
    }
     // Simple logic to suggest required based on label (only if required is still default false)
    if (required === false && (label.toLowerCase().includes('email') || label.toLowerCase().includes('name') || label.toLowerCase().includes('titel'))) {
        // Example: make 'email' or 'name' fields required by default
        required = true;
    }


    const updatedFieldData = { ...fieldData, name: sanitizedName, type: type, required: required };

    setFormData(prev => {
      const newFields = [...prev.fields];
      newFields[index] = updatedFieldData;
      // Check for name uniqueness after potential auto-generation
      const fieldNames = newFields.map(f => f.name);
      const nameSet = new Set(fieldNames);
      if (nameSet.size !== fieldNames.length && newFields.length > 1) {
         // Handle duplicate name scenario - maybe add suffix or warn user later in validation
         // For now, we allow it here and validation step will catch it
         // A more sophisticated approach could add _1, _2 etc.
      }
      return { ...prev, fields: newFields };
    });
  };

  // --- Start: New functions for managing the field editor assistant ---
  const startAddField = () => {
      if (formData.fields.length < 5) {
          setEditingFieldIndex(null); // Indicate adding a new field
          setIsEditingField(true);
      }
  };

  const startEditField = (index) => {
      setEditingFieldIndex(index);
      setIsEditingField(true);
  };

  const handleSaveField = (fieldData) => {
      setFormData(prev => {
          const newFields = [...prev.fields];
          if (editingFieldIndex === null) {
              // Adding new field
              newFields.push(fieldData);
          } else {
              // Updating existing field
              newFields[editingFieldIndex] = fieldData;
          }
          return { ...prev, fields: newFields };
      });
      setIsEditingField(false);
      setEditingFieldIndex(null);
  };

  const handleCancelEdit = () => {
      setIsEditingField(false);
      setEditingFieldIndex(null);
  };

  // --- End: New functions for managing the field editor assistant ---

  const deleteField = (index) => {
    setFormData(prev => ({
      ...prev,
      fields: prev.fields.filter((_, i) => i !== index)
    }));
  };

  // Validierung
  const validateStep = () => {
    setError(null);
    switch (currentStep) {
      case STEPS.BASICS:
        if (!formData.name) {
          setError('Der Name des Grünerators darf nicht leer sein.');
          return false;
        }
        if (!formData.slug) {
          setError('Der URL-Slug darf nicht leer sein.');
          return false;
        }
        if (!/^[a-z0-9-]+$/.test(formData.slug)) {
          setError('Der URL-Slug darf nur Kleinbuchstaben, Zahlen und Bindestriche enthalten.');
          return false;
        }
        return true;

      case STEPS.FIELDS:
        // Validation now only checks if the editor is closed
        if (isEditingField) {
            setError('Bitte schließe zuerst den Feld-Editor (Speichern oder Abbrechen).');
            return false;
        }
        // Basic check if fields are defined (validation within assistant is more detailed)
         const fieldNames = formData.fields.map(f => f.name);
         if (fieldNames.some(name => !name)) {
           // This check might be redundant if assistant ensures name generation
           setError('Ein Feld konnte keinen technischen Namen generieren.');
           return false;
         }
        const nameSet = new Set(fieldNames);
        if (nameSet.size !== fieldNames.length) {
          setError('Technische Feld-Namen müssen eindeutig sein.');
          return false;
        }
        // Removed detailed validation here, assuming assistant handles it before saving
        // if (formData.fields.some(field => !field.label)) { ... }
        return true;

      case STEPS.PROMPT:
        if (!formData.prompt) {
          setError('Die Prompt-Vorlage darf nicht leer sein.');
          return false;
        }
        // Removed validation for placeholders as they are now added automatically
        // const placeholdersInPrompt = formData.prompt.match(/{{([a-z0-9_]+)}}/g) || [];
        // const definedFieldNames = formData.fields.map(f => `{{${f.name}}}`);
        // for (const placeholder of placeholdersInPrompt) {
        //   if (!definedFieldNames.includes(placeholder)) {
        //     setError(`Der Platzhalter ${placeholder} ist nicht als Feld definiert.`);
        //     return false;
        //   }
        // }
        return true;

      default:
        return true;
    }
  };

  // Navigation
  const handleNext = (e) => {
    e.preventDefault();
    if (!validateStep()) {
      return;
    }
    if (currentStep < STEPS.REVIEW) {
      setCurrentStep(currentStep + 1);
    } else {
      handleSave();
    }
  };

  const handleBack = (e) => {
    e.preventDefault();
    if (currentStep > STEPS.BASICS) {
      setCurrentStep(currentStep - 1);
    }
  };

  // Speichern (Schritt 4)
  const handleSave = async () => {
    setLoading(true);
    setError(null);
    try {
      // Generate the string with placeholders for all defined fields
      const placeholderString = formData.fields.map(field => `{{${field.name}}}`).join(', ');
      // Construct the final prompt by appending the variable information
      const finalPrompt = `${formData.prompt.trim()}\n\nDer Benutzer stellt dir die folgenden Variablen zur Verfügung: ${placeholderString}`;

      const formSchema = { fields: formData.fields };
      const dataToSave = {
        name: formData.name,
        slug: formData.slug,
        form_schema: formSchema,
        prompt: finalPrompt // Save the modified prompt
      };

      await youSupabaseUtils.insertData('custom_generators', dataToSave);
      setSuccess(true);
      setTimeout(() => {
        navigate(`/generator/${formData.slug}`);
      }, 2000);
    } catch (err) {
      console.error("Error saving generator:", err);
      setError(`Fehler beim Speichern: ${err.message || 'Unbekannter Fehler'}`);
    } finally {
      setLoading(false);
    }
  };

  // Rendering der Schritte
  const renderCurrentStep = () => {
    switch (currentStep) {
      case STEPS.BASICS:
        return (
          <>
            <div className="form-group">
              <h3><label htmlFor="name">Name des Grünerators</label></h3>
              <input
                type="text"
                id="name"
                name="name"
                className="form-control"
                value={formData.name}
                onChange={handleInputChange}
                placeholder="z.B. Social Media Post Generator"
                required
              />
            </div>
            <div className="form-group">
              <h3>URL-Slug</h3>
              <input
                type="text"
                id="slug"
                name="slug"
                className="form-control"
                value={formData.slug}
                onChange={handleInputChange}
                placeholder="z.B. social-media-post"
                pattern="^[a-z0-9-]+$"
                required
              />
              <small className="help-text">
                Wird Teil der URL: /generator/{formData.slug || '...'}
              </small>
            </div>
          </>
        );

      case STEPS.FIELDS:
        return (
          <>
            <h3>Formularfelder definieren (max. 5)</h3>

            {/* Display List of Existing Fields */} 
            {!isEditingField && formData.fields.length > 0 && (
                 <ul className="list-group mb-3">
                     {formData.fields.map((field, index) => (
                         <li key={index} className="list-group-item d-flex justify-content-between align-items-center">
                             <div>
                                 <strong>{field.label || '(Ohne Label)'}</strong> ({field.type === 'textarea' ? 'Langer Text' : 'Kurzer Text'})
                                 <br />
                             </div>
                             <div>
                                 <button 
                                     type="button" 
                                     onClick={() => startEditField(index)} 
                                     className="btn btn-sm btn-outline-secondary me-2"
                                     aria-label={`Feld ${index + 1} bearbeiten`}
                                >
                                    Bearbeiten
                                 </button>
                                 <button 
                                     type="button" 
                                     onClick={() => deleteField(index)} 
                                     className="btn btn-sm btn-outline-danger"
                                     aria-label={`Feld ${index + 1} löschen`}
                                 >
                                     Löschen
                                 </button>
                             </div>
                         </li>
                     ))}
                 </ul>
            )}

            {/* Show Assistant when adding/editing */} 
            {isEditingField && (
                <FieldEditorAssistant 
                    // Pass existing field data if editing, otherwise null for new
                    initialFieldData={editingFieldIndex !== null ? formData.fields[editingFieldIndex] : null}
                    onSave={handleSaveField}
                    onCancel={handleCancelEdit}
                    // Pass existing names for validation purposes
                    existingFieldNames={formData.fields.map(f => f.name)}
                />
            )}

            {/* Show Add Button only if not editing and limit not reached */} 
            {!isEditingField && (
                <div className="add-field-controls">
                    {formData.fields.length < 5 && (
                        <button
                            type="button"
                            onClick={startAddField}
                            className="btn btn-tanne-bordered"
                        >
                            Neues Feld hinzufügen
                        </button>
                    )}
                    {/* Inform user if limit is reached */}
                    {formData.fields.length >= 5 && (
                        <p className="text-info">Maximale Anzahl von 5 Feldern erreicht.</p>
                    )}
                </div>
            )}
          </>
        );

      case STEPS.PROMPT:
        return (
          <>
            <h3>Prompt definieren</h3>
            <div className="form-group">
              <label htmlFor="prompt" className="white-text">Prompt-Vorlage</label>
              <textarea
                id="prompt"
                name="prompt"
                className="form-control"
                rows={10}
                value={formData.prompt}
                onChange={handleInputChange}
                placeholder="Beispiel: Erstelle einen kurzen Social-Media-Post für Instagram über das Thema Nachhaltigkeit. Sprich eine junge Zielgruppe an und verwende einen motivierenden Ton. Die definierten Feldinhalte werden automatisch übergeben."
                required
              />
            </div>
          </>
        );

      case STEPS.REVIEW:
        // Construct the final prompt for display in the review step
        const placeholderStringReview = formData.fields.map(field => `{{${field.name}}}`).join(', ');
        const finalPromptReview = `${formData.prompt.trim()}\n\nDer Benutzer stellt dir die folgenden Variablen zur Verfügung: ${placeholderStringReview}`;

        return (
          <>
            <h3>Überprüfung</h3>
            {/* Add the main review container */}
            <div className="review-container">
              <div className="review-section">
                <h4>Basisdaten</h4>
                <p><strong>Name:</strong> {formData.name}</p>
                <p><strong>URL:</strong> /generator/{formData.slug}</p>
              </div>
              <div className="review-section">
                <h4>Formularfelder</h4>
                {formData.fields.length > 0 && (
                    <ul className="list-group">
                    {formData.fields.map((field, index) => (
                        <li key={index} className="list-group-item">
                        <strong>{field.label}</strong> ({field.name})<br />
                        <small>
                          Typ: {field.type === 'textarea' ? 'Langer Text' : 'Kurzer Text'},
                          {field.required ? ' Pflichtfeld' : ' Optional'}
                          {field.placeholder ? `, Platzhalter: "${field.placeholder}"` : ''}
                        </small>
                        </li>
                    ))}
                    </ul>
                )}
              </div>
              <div className="review-section">
                <h4>Prompt</h4>
                {/* Apply specific class to pre tag and remove default Bootstrap classes */}
                <pre className="review-prompt-display">
                  {finalPromptReview} {/* Display the final constructed prompt */}
                </pre>
              </div>
            </div>
          </>
        );

      default:
        return null;
    }
  };

  return (
    <div className={`container ${showHeaderFooter ? 'with-header' : ''}`}>
      <BaseForm
        title="Neuen Grünerator erstellen"
        onSubmit={handleNext}
        onBack={handleBack}
        loading={loading}
        success={success}
        error={error}
        isMultiStep={true}
        // Hide Back button if editing a field
        showBackButton={currentStep > STEPS.BASICS && !isEditingField}
        // Hide Next/Save button if editing a field
        showNextButton={!isEditingField}
        nextButtonText={currentStep === STEPS.REVIEW ? 'Speichern' : 'Weiter'}
      >
        {renderCurrentStep()}
      </BaseForm>
    </div>
  );
};

export default CreateCustomGeneratorPage; 