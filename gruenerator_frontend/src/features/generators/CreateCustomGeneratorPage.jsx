import React, { useState } from 'react';
import BaseForm from '../../components/common/BaseForm';
import { youSupabaseUtils } from '../../components/utils/youSupabaseClient';
import { useNavigate } from 'react-router-dom';
import FieldEditorAssistant from './components/FieldEditorAssistant';
import { getCustomGeneratorHelpContent } from './constants/customGeneratorHelpContent';
import { STEPS } from './constants/steps';
import useApiSubmit from '../../components/hooks/useApiSubmit';

// Define steps, making MODE_SELECTION the very first step
const MODE_SELECTION = -1; 
const AI_STEP = 0; // Step for AI description input

// --- Start: Mode Selection Component Definition ---
// Replaced the old radio button component with clickable cards
const renderModeSelectionComponent = (creationMode, setCreationMode, setError, handleModeSelect) => (
    <div className="mode-selection-container">
        <div
            className={`mode-card ${creationMode === 'manual' ? 'selected' : ''}`}
            onClick={() => handleModeSelect('manual')}
            role="button" // Add role for accessibility
            tabIndex={0} // Make it focusable
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { handleModeSelect('manual'); }}} // Use handleModeSelect
        >
            <div className="mode-card__icon">🔧</div> {/* Icon for Manual */}
            <h5 className="mode-card__title">Manuell erstellen</h5>
            <p className="mode-card__description">Konfiguriere den Grünerator Schritt für Schritt und behalte die volle Kontrolle.</p>
        </div>
        <div
            className={`mode-card ${creationMode === 'ai' ? 'selected' : ''}`}
            onClick={() => handleModeSelect('ai')}
            role="button" // Add role for accessibility
            tabIndex={0} // Make it focusable
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { handleModeSelect('ai'); }}} // Use handleModeSelect
        >
            <div className="mode-card__icon">✨</div> {/* Icon for AI */}
            <h5 className="mode-card__title">Mit KI erstellen</h5>
            <p className="mode-card__description">Lass die KI einen Vorschlag basierend auf deiner Beschreibung generieren.</p>
        </div>
    </div>
);
// --- End: Mode Selection Component Definition ---

const CreateCustomGeneratorPage = ({ showHeaderFooter = true }) => {
  // Add state for creation mode and AI description
  const [creationMode, setCreationMode] = useState('manual'); // 'manual' or 'ai'
  const [aiDescription, setAiDescription] = useState('');
  const [isGeneratingWithAI, setIsGeneratingWithAI] = useState(false); // Loading state for AI generation

  const [currentStep, setCurrentStep] = useState(MODE_SELECTION); // Start at mode selection
  const [formData, setFormData] = useState({
    name: '',
    slug: '',
    fields: [],
    prompt: ''
  });
  // Separate loading states: one for AI generation, one for final save
  const [saveLoading, setSaveLoading] = useState(false); 
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const navigate = useNavigate();
  
  // Use the hook for the new endpoint
  const { 
      submitForm: submitAIGeneration, 
      loading: aiLoading, // Use separate loading state from hook
      error: aiError,
      resetSuccess: resetAISuccess // Optional: if needed
  } = useApiSubmit('/generate_generator_config');

  // State for managing the field editor assistant
  const [isEditingField, setIsEditingField] = useState(false);
  const [editingFieldIndex, setEditingFieldIndex] = useState(null); // null for new field, index for existing

  // Handler for AI description input
  const handleAiDescriptionChange = (e) => {
      setAiDescription(e.target.value);
      setError(null); // Clear general error on input change
      // Optionally clear aiError too, or handle it separately
  };

  // Handler for simple form inputs (name, slug, prompt)
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    let processedValue = value;
    
    if (name === 'slug') {
      processedValue = value
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-]/g, '');
    }

    setFormData(prev => ({ ...prev, [name]: processedValue }));
    setError(null); // Clear general error
  };

  // --- Start: New function to handle mode selection and navigation --- 
  const handleModeSelect = (mode) => {
    setCreationMode(mode);
    setError(null);
    if (mode === 'ai') {
        setCurrentStep(AI_STEP);
    } else {
        setCurrentStep(STEPS.BASICS);
    }
  };
  // --- End: New function to handle mode selection and navigation --- 

  // --- Start: New function for handling AI generation ---
  const handleGenerateWithAI = async (e) => {
      e.preventDefault();
      setError(null); // Clear previous general errors
      setIsGeneratingWithAI(true); // Set specific AI loading state

      try {
          console.log('[CreateCustom] Sending description to AI:', aiDescription);
          const generatedConfig = await submitAIGeneration({ description: aiDescription });
          
          console.log('[CreateCustom] Received AI config:', generatedConfig);
          
          if (generatedConfig && generatedConfig.name && generatedConfig.slug && generatedConfig.fields && generatedConfig.prompt) {
              // Update formData with the AI-generated configuration
              setFormData({
                  name: generatedConfig.name,
                  slug: generatedConfig.slug,
                  fields: generatedConfig.fields,
                  prompt: generatedConfig.prompt
              });
              // Switch back to manual mode and proceed to review or basics
              setCreationMode('manual'); 
              setCurrentStep(STEPS.BASICS); // Go to basics first for review/edit
              setAiDescription(''); // Clear the description field
          } else {
              // Handle cases where the structure might be invalid despite hook validation
              console.error('[CreateCustom] Invalid config structure received from AI:', generatedConfig);
              setError('Fehler: Die von der KI generierte Konfiguration ist unvollständig oder ungültig.');
          }

      } catch (err) {
          console.error('[CreateCustom] Error during AI generation:', err);
          // Use the error from the hook if available, otherwise a generic message
          setError(aiError || `Fehler bei der KI-Generierung: ${err.message || 'Unbekannter Fehler'}`);
      } finally {
          setIsGeneratingWithAI(false); // Clear specific AI loading state
      }
  };
  // --- End: New function for handling AI generation ---


  // Field management (Step 2 - unchanged)
  const handleFieldChange = (index, fieldData) => {
    const { label } = fieldData;
    let { name, type, required } = fieldData;

    const sanitizedName = label
      .toLowerCase()
      .replace(/\s+/g, '_')
      .replace(/[^a-z0-9_]/g, '');

    if (type === 'text' && (label.includes('beschreibung') || label.includes('text') || label.includes('inhalt') || label.includes('prompt') || label.includes('abschnitt'))) {
        type = 'textarea';
    }
    if (required === false && (label.toLowerCase().includes('email') || label.toLowerCase().includes('name') || label.toLowerCase().includes('titel'))) {
        required = true;
    }

    const updatedFieldData = { ...fieldData, name: sanitizedName, type: type, required: required };

    setFormData(prev => {
      const newFields = [...prev.fields];
      newFields[index] = updatedFieldData;
      const fieldNames = newFields.map(f => f.name);
      const nameSet = new Set(fieldNames);
      if (nameSet.size !== fieldNames.length && newFields.length > 1) {
         // Simple duplicate handling (maybe add suffix later)
      }
      return { ...prev, fields: newFields };
    });
  };

  const startAddField = () => {
      if (formData.fields.length < 5) {
          setEditingFieldIndex(null); 
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
              newFields.push(fieldData);
          } else {
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

  const deleteField = (index) => {
    setFormData(prev => ({
      ...prev,
      fields: prev.fields.filter((_, i) => i !== index)
    }));
  };

  // Validation - Adapt based on current step or mode
  const validateStep = () => {
    setError(null);
    
    // No validation needed in MODE_SELECTION or AI_STEP before generation
    if (currentStep === MODE_SELECTION || currentStep === AI_STEP) return true; 

    switch (currentStep) {
      case STEPS.BASICS:
        if (!formData.name) {
          setError('Der Name des Grünerators darf nicht leer sein.');
          return false;
        }
        if (!formData.slug) {
          setError('Der URL-Pfad darf nicht leer sein.');
          return false;
        }
        if (!/^[a-z0-9-]+$/.test(formData.slug)) {
          setError('Der URL-Pfad darf nur Kleinbuchstaben, Zahlen und Bindestriche enthalten.');
          return false;
        }
        return true;

      case STEPS.FIELDS:
        if (isEditingField) {
            setError('Bitte schließe zuerst den Feld-Editor (Speichern oder Abbrechen).');
            return false;
        }
         const fieldNames = formData.fields.map(f => f.name);
         if (fieldNames.some(name => !name)) {
           setError('Ein Feld konnte keinen technischen Namen generieren.');
           return false;
         }
        const nameSet = new Set(fieldNames);
        if (nameSet.size !== fieldNames.length) {
          setError('Technische Feld-Namen müssen eindeutig sein.');
          return false;
        }
        return true;

      case STEPS.PROMPT:
        if (!formData.prompt) {
          setError('Die Prompt-Vorlage darf nicht leer sein.');
          return false;
        }
        return true;

      default:
        return true;
    }
  };

  // Navigation
  const handleNext = (e) => {
    e.preventDefault();

    // --- Step 1: Handle MODE_SELECTION --- 
    // REMOVED: Logic moved to handleModeSelect
    // if (currentStep === MODE_SELECTION) { ... }

    // --- Step 2: Handle AI Generation Trigger --- 
    if (currentStep === AI_STEP && creationMode === 'ai') {
        handleGenerateWithAI(e); // Trigger AI generation
        return;
    }
    
    // --- Step 3: Handle Manual Mode Navigation --- 
    if (creationMode === 'manual') {
        if (!validateStep()) {
          return;
        }
        if (currentStep < STEPS.REVIEW) {
          setCurrentStep(currentStep + 1);
        } else {
          handleSave(); // Trigger final save in review step
        }
    }
  };

  const handleBack = (e) => {
    e.preventDefault();
    setError(null); // Clear error on back navigation
    // Allow going back to mode selection from the first content step (AI or Manual Basics)
    if (currentStep === AI_STEP || currentStep === STEPS.BASICS) {
        setCurrentStep(MODE_SELECTION);
    } 
    // Handle back navigation within manual steps
    else if (creationMode === 'manual' && currentStep > STEPS.BASICS) {
      setCurrentStep(currentStep - 1);
    } 
    // No back action from MODE_SELECTION needed
  };

  // Save (Step 4 - unchanged logic, uses separate loading state)
  const handleSave = async () => {
    setSaveLoading(true); // Use specific save loading state
    setError(null);
    try {
      const placeholderString = formData.fields.map(field => `{{${field.name}}}`).join(', ');
      const finalPrompt = `${formData.prompt.trim()}\n\nDer Benutzer stellt dir die folgenden Variablen zur Verfügung: ${placeholderString}`;
      const formSchema = { fields: formData.fields };
      const dataToSave = {
        name: formData.name,
        slug: formData.slug,
        form_schema: formSchema,
        prompt: finalPrompt
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
      setSaveLoading(false); // Clear specific save loading state
    }
  };

  // --- Start: Render AI Input Step --- (Now triggered at AI_STEP) ---
  const renderAIStep = () => (
    <>
      {/* Title now comes from BaseForm */}
      <div className="form-group">
        <label htmlFor="aiDescription">Beschreibe, was der Grünerator können soll:</label>
        <textarea
          id="aiDescription"
          name="aiDescription"
          className="form-control"
          rows={5}
          value={aiDescription}
          onChange={handleAiDescriptionChange}
          placeholder="Beispiel: Ein Generator, der Social-Media-Posts für Instagram zum Thema Radverkehr in der Stadt erstellt. Er soll nach dem Thema, der Zielgruppe und einem lokalen Bezug fragen."
          required
        />
      </div>
      {/* Display AI-specific errors here */}
      {aiError && <div className="alert alert-danger mt-2">{aiError}</div>} 
    </>
  );
  // --- End: Render AI Input Step ---


  // --- Start: Modified Render Current Step Logic --- 
  const renderCurrentStep = () => {

    switch (currentStep) {
      // Render Mode Selection first
      case MODE_SELECTION:
        return renderModeSelectionComponent(creationMode, setCreationMode, setError, handleModeSelect);
      
      // Render AI Description Input
      case AI_STEP:
        if (creationMode === 'ai') {
           return renderAIStep(); 
        } 
        // Should not happen, but fallback
        return <p>Fehler: Ungültiger Zustand.</p>;

      // Render Manual Steps
      case STEPS.BASICS:
        if (creationMode === 'manual') {
          return (
            <>
              {/* Form fields for Basics */}
              <div className="form-group">
                <h3><label htmlFor="name">Name des Grünerators</label></h3>
                <input type="text" id="name" name="name" className="form-control" value={formData.name} onChange={handleInputChange} placeholder="z.B. Social Media Post Generator" required />
              </div>
              <div className="form-group">
                <h3><label htmlFor="slug">URL-Pfad</label></h3>
                <input type="text" id="slug" name="slug" className="form-control" value={formData.slug} onChange={handleInputChange} placeholder="z.B. social-media-post" pattern="^[a-z0-9-]+$" required />
                <small className="help-text">Wird Teil der URL: /generator/{formData.slug || '...'}</small>
              </div>
            </>
          );
        }
        return null;

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
                                  <button type="button" onClick={() => startEditField(index)} className="btn btn-sm btn-outline-secondary me-2" aria-label={`Feld ${index + 1} bearbeiten`}>Bearbeiten</button>
                                  <button type="button" onClick={() => deleteField(index)} className="btn btn-sm btn-outline-danger" aria-label={`Feld ${index + 1} löschen`}>Löschen</button>
                              </div>
                          </li>
                      ))}
                  </ul>
             )}
             {/* Show Assistant when adding/editing */} 
             {isEditingField && (
                 <FieldEditorAssistant 
                     initialFieldData={editingFieldIndex !== null ? formData.fields[editingFieldIndex] : null}
                     onSave={handleSaveField}
                     onCancel={handleCancelEdit}
                     existingFieldNames={formData.fields.map(f => f.name)}
                 />
             )}
             {/* Show Add Button */} 
             {!isEditingField && (
                 <div className="add-field-controls">
                     {formData.fields.length < 5 && ( <button type="button" onClick={startAddField} className="btn btn-tanne-bordered"> Neues Feld hinzufügen </button> )}
                     {formData.fields.length >= 5 && ( <p className="text-info">Maximale Anzahl von 5 Feldern erreicht.</p> )}
                 </div>
             )}
          </>
        );

      case STEPS.PROMPT:
        return (
          <>
            <h3>Prompt definieren</h3>
            <div className="form-group">
              <textarea id="prompt" name="prompt" className="form-control" rows={10} value={formData.prompt} onChange={handleInputChange} placeholder="Beispiel: Erstelle einen kurzen Social-Media-Post..." required />
            </div>
          </>
        );

      case STEPS.REVIEW:
        const placeholderStringReview = formData.fields.map(field => `{{${field.name}}}`).join(', ');
        const finalPromptReview = `${formData.prompt.trim()}\n\nDer Benutzer stellt dir die folgenden Variablen zur Verfügung: ${placeholderStringReview}`;
        return (
          <>
            <h3>Überprüfung</h3>
            <div className="review-container">
              {/* Review sections (Basisdaten, Formularfelder, Prompt) */}
               <div className="review-section"><h4>Basisdaten</h4><p><strong>Name:</strong> {formData.name}</p><p><strong>URL:</strong> /generator/{formData.slug}</p></div>
               <div className="review-section"><h4>Formularfelder</h4>
                  {formData.fields.length > 0 && (<ul className="list-group">{formData.fields.map((field, index) => (<li key={index} className="list-group-item"><strong>{field.label}</strong> ({field.name})<br /><small>Typ: {field.type === 'textarea' ? 'Langer Text' : 'Kurzer Text'}, {field.required ? ' Pflichtfeld' : ' Optional'}{field.placeholder ? `, Platzhalter: "${field.placeholder}"` : ''}</small></li>))}</ul>)}
               </div>
               <div className="review-section"><h4>Prompt</h4><pre className="review-prompt-display">{finalPromptReview}</pre></div>
            </div>
          </>
        );

      default:
        return null;
    }
  };
  // --- End: Modified Render Current Step Logic ---

  // Determine help content based on mode and step
  const getHelpContentForStep = (step, mode) => {
    if (step === MODE_SELECTION) {
        return { title: "Schritt 1: Erstellungsart wählen", content: "Wähle, ob du den Grünerator Schritt für Schritt manuell konfigurieren oder einen Vorschlag basierend auf einer Beschreibung von der KI erstellen lassen möchtest." };
    } 
    if (step === AI_STEP && mode === 'ai') {
        return { title: "Schritt 2: Grünerator beschreiben", content: "Gib eine möglichst genaue Beschreibung, was der Grünerator tun soll. Die KI wird daraus einen Vorschlag für Name, URL, Formularfelder und den Prompt generieren, den du danach anpassen kannst." };
    }
    // Use existing function for manual steps
    if (mode === 'manual') {
        return getCustomGeneratorHelpContent(step); 
    }
    // Fallback
    return { title: "Neuen Grünerator erstellen", content: "" };
  };

  const helpContent = getHelpContentForStep(currentStep, creationMode);

  return (
    <div className={`container ${showHeaderFooter ? 'with-header' : ''}`}>
      {/* Mode Selection is now rendered inside BaseForm via renderCurrentStep */}

      <BaseForm
        title={helpContent?.title || "Neuen Grünerator erstellen"}
        onSubmit={handleNext} 
        onBack={handleBack}
        // Loading state logic adjusted slightly
        loading={currentStep === AI_STEP ? isGeneratingWithAI : (currentStep === STEPS.REVIEW ? saveLoading : false)}
        success={success}
        error={error || (currentStep === AI_STEP ? aiError : null)} // Show general OR AI error depending on step
        isMultiStep={true}
        // Control button visibility based on mode and step
        showBackButton={currentStep !== MODE_SELECTION && !isEditingField} // Hide back on first step
        // Modify showNextButton prop: Hide in MODE_SELECTION, otherwise use existing logic
        showNextButton={currentStep !== MODE_SELECTION && (creationMode === 'manual' ? !isEditingField : true)}
        // Modify button text based on mode/step
        nextButtonText={
            currentStep === AI_STEP
            ? 'KI-Vorschlag generieren'
            : (currentStep === STEPS.REVIEW ? 'Speichern' : 'Weiter')
        }
        helpContent={helpContent}
      >
        {/* Mode Selection is now rendered via renderCurrentStep */}
        {/* {renderModeSelection(creationMode, setCreationMode, setError, setCurrentStep)} REMOVED */}

        {/* Render the current step/view based on mode and step */}
        {renderCurrentStep()}
      </BaseForm>
    </div>
  );
};

export default CreateCustomGeneratorPage; 