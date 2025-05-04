import React, { useState } from 'react';
import BaseForm from '../../components/common/BaseForm';
import { templatesSupabaseUtils } from '../../components/utils/templatesSupabaseClient';
import { useNavigate } from 'react-router-dom';
import FieldEditorAssistant from './components/FieldEditorAssistant';
import { getCustomGeneratorHelpContent } from './constants/customGeneratorHelpContent';
import { STEPS } from './constants/steps';
import useApiSubmit from '../../components/hooks/useApiSubmit';
import GeneratorStartScreen from './components/GeneratorStartScreen';
import GeneratorCreationSuccessScreen from './components/GeneratorCreationSuccessScreen';

// Define steps
const MODE_SELECTION = -1;

const INITIAL_FORM_DATA = {
  name: '',
  slug: '',
  fields: [],
  prompt: '',
  title: '',
  description: '',
  contact_email: ''
};

const CreateCustomGeneratorPage = ({ showHeaderFooter = true }) => {
  const [currentStep, setCurrentStep] = useState(MODE_SELECTION);
  const [formData, setFormData] = useState(INITIAL_FORM_DATA);
  const [aiDescription, setAiDescription] = useState('');
  const [isGeneratingWithAI, setIsGeneratingWithAI] = useState(false);
  const [error, setError] = useState(null);
  const [completionData, setCompletionData] = useState(null);
  const navigate = useNavigate();
  
  const { 
    submitForm: submitAIGeneration, 
    loading: aiLoading,
    error: aiError,
    resetSuccess: resetAISuccess
  } = useApiSubmit('/generate_generator_config');

  // State for managing the field editor assistant
  const [isEditingField, setIsEditingField] = useState(false);
  const [editingFieldIndex, setEditingFieldIndex] = useState(null);

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
    setError(null);
  };

  // Handler for AI description
  const handleAiDescriptionChange = (value) => {
    setAiDescription(value);
    setError(null);
  };

  // Handler for manual mode selection
  const handleManualSetup = () => {
    setCurrentStep(STEPS.BASICS);
    setError(null);
  };

  // Handler for AI generation
  const handleGenerateWithAI = async () => {
    setError(null);
    setIsGeneratingWithAI(true);

    try {
      const generatedConfig = await submitAIGeneration({ description: aiDescription });
      
      if (generatedConfig && generatedConfig.name && generatedConfig.slug && generatedConfig.fields && generatedConfig.prompt) {
        setFormData({
          name: generatedConfig.name,
          slug: generatedConfig.slug,
          fields: generatedConfig.fields,
          prompt: generatedConfig.prompt,
          title: generatedConfig.title || '',
          description: generatedConfig.description || '',
          contact_email: generatedConfig.contact_email || ''
        });
        setCurrentStep(STEPS.BASICS);
        setAiDescription('');
      } else {
        setError('Fehler: Die von der KI generierte Konfiguration ist unvollständig oder ungültig.');
      }
    } catch (err) {
      console.error('[CreateCustom] Error during AI generation:', err);
      setError(aiError || `Fehler bei der KI-Generierung: ${err.message || 'Unbekannter Fehler'}`);
    } finally {
      setIsGeneratingWithAI(false);
    }
  };

  // Field management
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

    const updatedFieldData = { ...fieldData, name: sanitizedName, type, required };

    setFormData(prev => {
      const newFields = [...prev.fields];
      newFields[index] = updatedFieldData;
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

  // Validation
  const validateStep = () => {
    setError(null);
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
        if (!formData.title) {
          setError('Der Titel darf nicht leer sein.');
          return false;
        }
        if (!formData.description) {
          setError('Die Beschreibung darf nicht leer sein.');
          return false;
        }
        return true;

      case STEPS.FIELDS:
        if (isEditingField) {
          setError('Bitte schließe zuerst den Feld-Editor (Speichern oder Abbrechen).');
          return false;
        }
        return true;

      case STEPS.PROMPT:
        if (!formData.prompt) {
          setError('Die Prompt-Vorlage darf nicht leer sein.');
          return false;
        }
        if (!formData.contact_email) {
          setError('Die E-Mail für Rückfragen darf nicht leer sein.');
          return false;
        }
        if (!emailRegex.test(formData.contact_email)) {
          setError('Bitte geben Sie eine gültige E-Mail-Adresse ein.');
          return false;
        }
        return true;

      case STEPS.REVIEW:
        const placeholderStringReview = formData.fields.map(field => `{{${field.name}}}`).join(', ');
        const finalPromptReview = `${formData.prompt.trim()}\n\nDer Benutzer stellt dir die folgenden Variablen zur Verfügung: ${placeholderStringReview}`;
        return (
          <>
            <h3>Überprüfung</h3>
            <div className="review-container">
              <div className="review-section">
                <h4>Basisdaten</h4>
                <p><strong>Name:</strong> {formData.name}</p>
                <p><strong>URL:</strong> /generator/{formData.slug}</p>
                <p><strong>Titel:</strong> {formData.title}</p>
                <p><strong>Beschreibung:</strong> {formData.description}</p>
                <p><strong>Kontakt-E-Mail:</strong> {formData.contact_email}</p>
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
                <pre className="review-prompt-display">{finalPromptReview}</pre>
              </div>
            </div>
          </>
        );

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
    setError(null);
    if (currentStep > STEPS.BASICS) {
      setCurrentStep(currentStep - 1);
    }
  };

  // Save
  const handleSave = async () => {
    setIsGeneratingWithAI(true);
    setError(null);
    try {
      const placeholderString = formData.fields.map(field => `{{${field.name}}}`).join(', ');
      const finalPrompt = `${formData.prompt.trim()}\n\nDer Benutzer stellt dir die folgenden Variablen zur Verfügung: ${placeholderString}`;
      const formSchema = { fields: formData.fields };
      const dataToSave = {
        name: formData.name,
        slug: formData.slug,
        form_schema: formSchema,
        prompt: finalPrompt,
        title: formData.title,
        description: formData.description,
        contact_email: formData.contact_email
      };

      await templatesSupabaseUtils.insertData('custom_generators', dataToSave);
      setCompletionData({ name: dataToSave.name, slug: dataToSave.slug });
      navigate('/you/generators');
    } catch (err) {
      console.error("Error saving generator:", err);
      setError(`Fehler beim Speichern: ${err.message || 'Unbekannter Fehler'}`);
    } finally {
      setIsGeneratingWithAI(false);
    }
  };

  // Restart the creation process
  const handleRestart = () => {
    setCurrentStep(MODE_SELECTION);
    setFormData(INITIAL_FORM_DATA);
    setAiDescription('');
    setError(null);
    setCompletionData(null);
    setIsEditingField(false);
    setEditingFieldIndex(null);
    resetAISuccess();
  };

  // Render current step content for BaseForm
  const renderCurrentStep = () => {
    switch (currentStep) {
      case STEPS.BASICS:
        return (
          <>
            <div className="form-group">
              <h3><label htmlFor="name">Name des Grünerators</label></h3>
              <input type="text" id="name" name="name" className="form-control" value={formData.name} onChange={handleInputChange} placeholder="z.B. Social Media Post Generator" required />
            </div>
            <div className="form-group">
              <h3><label htmlFor="slug">URL-Pfad</label></h3>
              <input type="text" id="slug" name="slug" className="form-control" value={formData.slug} onChange={handleInputChange} placeholder="z.B. social-media-post" pattern="^[a-z0-9-]+$" required />
              <small className="help-text">Wird Teil der URL: /generator/{formData.slug || '...'}</small>
            </div>
            <div className="form-group">
              <h3><label htmlFor="title">Titel</label></h3>
              <input type="text" id="title" name="title" className="form-control" value={formData.title} onChange={handleInputChange} placeholder="Titel, der auf der Generator-Seite angezeigt wird" required />
            </div>
            <div className="form-group">
              <h3><label htmlFor="description">Beschreibung</label></h3>
              <textarea id="description" name="description" className="form-control" rows={3} value={formData.description} onChange={handleInputChange} placeholder="Kurze Beschreibung des Generators und wofür er nützlich ist" required />
            </div>
          </>
        );

      case STEPS.FIELDS:
        return (
          <>
            <h3>Formularfelder definieren (max. 5)</h3>
            {!isEditingField && formData.fields.length > 0 && (
              <ul className="list-group mb-3">
                {formData.fields.map((field, index) => (
                  <li key={index} className="list-group-item d-flex justify-content-between align-items-center">
                    <div>
                      <strong>{field.label || '(Ohne Label)'}</strong> ({field.type === 'textarea' ? 'Langer Text' : 'Kurzer Text'})
                      <br />
                    </div>
                    <div>
                      <button type="button" onClick={() => startEditField(index)} className="btn btn-sm btn-outline-secondary me-2">Bearbeiten</button>
                      <button type="button" onClick={() => deleteField(index)} className="btn btn-sm btn-outline-danger">Löschen</button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {isEditingField && (
              <FieldEditorAssistant 
                initialFieldData={editingFieldIndex !== null ? formData.fields[editingFieldIndex] : null}
                onSave={handleSaveField}
                onCancel={handleCancelEdit}
                existingFieldNames={formData.fields.map(f => f.name)}
              />
            )}
            {!isEditingField && (
              <div className="add-field-controls">
                {formData.fields.length < 5 && (
                  <button type="button" onClick={startAddField} className="btn btn-tanne-bordered">
                    Neues Feld hinzufügen
                  </button>
                )}
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
              <textarea id="prompt" name="prompt" className="form-control" rows={10} value={formData.prompt} onChange={handleInputChange} placeholder="Beispiel: Erstelle einen kurzen Social-Media-Post..." required />
            </div>
            <div className="form-group">
              <h3><label htmlFor="contact_email">E-Mail für Rückfragen</label></h3>
              <input type="email" id="contact_email" name="contact_email" className="form-control" value={formData.contact_email} onChange={handleInputChange} placeholder="Deine E-Mail für technische Rückfragen (wird nicht öffentlich angezeigt)" required />
              <small className="help-text">Wird benötigt, falls es Probleme mit dem Generator gibt.</small>
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
              <div className="review-section">
                <h4>Basisdaten</h4>
                <p><strong>Name:</strong> {formData.name}</p>
                <p><strong>URL:</strong> /generator/{formData.slug}</p>
                <p><strong>Titel:</strong> {formData.title}</p>
                <p><strong>Beschreibung:</strong> {formData.description}</p>
                <p><strong>Kontakt-E-Mail:</strong> {formData.contact_email}</p>
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
                <pre className="review-prompt-display">{finalPromptReview}</pre>
              </div>
            </div>
          </>
        );

      default:
        return null;
    }
  };

  // Get help content based on current step
  const helpContent = getCustomGeneratorHelpContent(currentStep);

  // Main render logic: Show success screen or the creation process
  if (completionData) {
    return (
      <div className={`container ${showHeaderFooter ? 'with-header' : ''}`}>
        <GeneratorCreationSuccessScreen
          name={completionData.name}
          slug={completionData.slug}
          onRestart={handleRestart}
        />
      </div>
    );
  }

  // If not completed, render the StartScreen or BaseForm
  if (currentStep === MODE_SELECTION) {
    return (
      <div className={`container ${showHeaderFooter ? 'with-header' : ''}`}>
        <GeneratorStartScreen
          aiDescription={aiDescription}
          onDescriptionChange={handleAiDescriptionChange}
          onGenerateWithAI={handleGenerateWithAI}
          onManualSetup={handleManualSetup}
          isLoading={isGeneratingWithAI || aiLoading}
          error={error || aiError}
        />
      </div>
    );
  }

  // Otherwise, render the BaseForm with the current step
  return (
    <div className={`container ${showHeaderFooter ? 'with-header' : ''}`}>
      <BaseForm
        title={helpContent?.title || "Neuen Grünerator erstellen"}
        onSubmit={handleNext}
        onBack={handleBack}
        loading={isGeneratingWithAI}
        error={error}
        isMultiStep={true}
        showBackButton={currentStep > STEPS.BASICS && !isEditingField}
        showNextButton={!isEditingField}
        nextButtonText={currentStep === STEPS.REVIEW ? 'Speichern' : 'Weiter'}
        helpContent={helpContent}
      >
        {renderCurrentStep()}
      </BaseForm>
    </div>
  );
};

export default CreateCustomGeneratorPage; 