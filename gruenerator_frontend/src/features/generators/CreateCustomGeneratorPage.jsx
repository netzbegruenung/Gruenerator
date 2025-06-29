import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import FormSection from '../../components/common/Form/BaseForm/FormSection';
import FormInput from '../../components/common/Form/Input/FormInput';
import FormTextarea from '../../components/common/Form/Input/FormTextarea';
import { useNavigate } from 'react-router-dom';
import FieldEditorAssistant from './components/FieldEditorAssistant';
import { getCustomGeneratorHelpContent } from './constants/customGeneratorHelpContent';
import { STEPS } from './constants/steps';
import useApiSubmit from '../../components/hooks/useApiSubmit';
import useDebounce from '../../components/hooks/useDebounce';
import apiClient from '../../components/utils/apiClient';
import GeneratorStartScreen from './components/GeneratorStartScreen';
import GeneratorCreationSuccessScreen from './components/GeneratorCreationSuccessScreen';
import { useOptimizedAuth } from '../../hooks/useAuth';
import InlineValidationMessage from '../../components/common/UI/InlineValidationMessage';
import DocumentUpload from '../../components/common/DocumentUpload';
import DocumentSelector from './components/DocumentSelector';
import '../../assets/styles/components/custom-generator/custom-generator-page.css';

// Auth Backend URL aus Environment Variable oder Fallback zu aktuellem Host
const AUTH_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

// Define steps
const MODE_SELECTION = -1;
const SLUG_CHECK_DELAY = 750; // Delay for slug check in ms

const INITIAL_FORM_DATA = {
  name: '',
  slug: '',
  fields: [],
  documents: [],
  prompt: '',
  title: '',
  description: '',
  contact_email: ''
};

const CreateCustomGeneratorPage = ({ showHeaderFooter = true }) => {
  const [currentStep, setCurrentStep] = useState(MODE_SELECTION);
  const [aiDescription, setAiDescription] = useState('');
  const [isGeneratingWithAI, setIsGeneratingWithAI] = useState(false);
  const [error, setError] = useState(null);
  const [completionData, setCompletionData] = useState(null);
  const navigate = useNavigate();
  const { user } = useOptimizedAuth();
  
  // React Hook Form setup
  const {
    control,
    handleSubmit,
    watch,
    setValue,
    getValues,
    formState: { errors },
    reset
  } = useForm({
    defaultValues: INITIAL_FORM_DATA,
    mode: 'onChange'
  });
  
  // Watch slug for debouncing and processing
  const watchedSlug = watch('slug');
  
  // Effect to process slug input
  useEffect(() => {
    if (watchedSlug) {
      const processedSlug = watchedSlug
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-]/g, '');
      
      if (processedSlug !== watchedSlug) {
        setValue('slug', processedSlug);
        setSlugAvailabilityError(null);
        setError(null);
      }
    }
  }, [watchedSlug, setValue]);
  
  const { 
    submitForm: submitAIGeneration, 
    loading: aiLoading,
    error: aiError,
    resetSuccess: resetAISuccess
  } = useApiSubmit('/generate_generator_config');

  const debouncedSlug = useDebounce(watchedSlug, SLUG_CHECK_DELAY);
  const [isCheckingSlug, setIsCheckingSlug] = useState(false);
  const [slugAvailabilityError, setSlugAvailabilityError] = useState(null);

  // State for managing the field editor assistant
  const [isEditingField, setIsEditingField] = useState(false);
  const [editingFieldIndex, setEditingFieldIndex] = useState(null);

  // Set initial contact_email if user is logged in
  useEffect(() => {
    if (user && user.email) {
      setValue('contact_email', user.email);
    }
  }, [user, setValue]);

  // Effect for checking slug availability
  useEffect(() => {
    const checkSlug = async () => {
      if (!debouncedSlug || debouncedSlug.length < 3) {
        setSlugAvailabilityError(null); // Clear error if slug is too short or empty
        setIsCheckingSlug(false);
        return;
      }

      setIsCheckingSlug(true);
      setSlugAvailabilityError(null);
      setError(null); // Clear general form error

      try {
        const response = await apiClient.get(`/custom_generator/check-slug/${debouncedSlug}`);
        const data = response.data;

        if (data.exists) {
          setSlugAvailabilityError('Diese URL ist bereits vergeben. Bitte wähle eine andere.');
        } else {
          setSlugAvailabilityError(null);
        }
      } catch (err) {
        console.error('[CreateCustomGeneratorPage] Slug check error:', err);
        // Don't set a blocking error for network issues, allow user to proceed with caution
        // Or, set a non-blocking warning: setSlugAvailabilityError('Slug-Prüfung fehlgeschlagen. Bitte versuchen Sie es später erneut.');
      } finally {
        setIsCheckingSlug(false);
      }
    };

    checkSlug();
  }, [debouncedSlug]);

  // Handler for clearing errors when inputs change
  const handleInputChange = () => {
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
        // Reset form with generated data
        reset({
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
    const currentFields = getValues('fields');
    const newFields = [...currentFields];
    newFields[index] = updatedFieldData;
    setValue('fields', newFields);
  };

  const startAddField = () => {
    const currentFields = getValues('fields');
    if (currentFields.length < 5) {
      setEditingFieldIndex(null); 
      setIsEditingField(true);
    }
  };

  const startEditField = (index) => {
    setEditingFieldIndex(index);
    setIsEditingField(true);
  };

  const handleSaveField = (fieldData) => {
    const currentFields = getValues('fields');
    const newFields = [...currentFields];
    if (editingFieldIndex === null) {
      newFields.push(fieldData);
    } else {
      newFields[editingFieldIndex] = fieldData;
    }
    setValue('fields', newFields);
    setIsEditingField(false);
    setEditingFieldIndex(null);
  };

  const handleCancelEdit = () => {
    setIsEditingField(false);
    setEditingFieldIndex(null);
  };

  const deleteField = (index) => {
    const currentFields = getValues('fields');
    setValue('fields', currentFields.filter((_, i) => i !== index));
  };

  // Validation
  const validateStep = () => {
    setError(null);
    const formValues = getValues();

    switch (currentStep) {
      case STEPS.BASICS:
        if (!formValues.name) {
          setError('Der Name des Grünerators darf nicht leer sein.');
          return false;
        }
        if (!formValues.slug) {
          setError('Der URL-Pfad darf nicht leer sein.');
          return false;
        }
        if (!/^[a-z0-9-]+$/.test(formValues.slug)) {
          setError('Der URL-Pfad darf nur Kleinbuchstaben, Zahlen und Bindestriche enthalten.');
          return false;
        }
        if (slugAvailabilityError) {
          setError(slugAvailabilityError);
          return false;
        }
        if (isCheckingSlug) {
          setError('Die Verfügbarkeit des URL-Pfads wird noch geprüft...');
          return false;
        }
        if (!formValues.title) {
          setError('Der Titel darf nicht leer sein.');
          return false;
        }
        if (!formValues.description) {
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

      case STEPS.DOCUMENTS:
        // Documents are optional, so always valid
        return true;

      case STEPS.PROMPT:
        if (!formValues.prompt) {
          setError('Die Prompt-Vorlage darf nicht leer sein.');
          return false;
        }
        return true;

      case STEPS.REVIEW:
        return true;

      default:
        return true;
    }
  };

  // Navigation with React Hook Form
  const onSubmit = (data) => {
    if (!validateStep()) {
      return;
    }
    if (currentStep < STEPS.REVIEW) {
      setCurrentStep(currentStep + 1);
    } else {
      handleSave();
    }
  };

  // Navigation
  const handleNext = handleSubmit(onSubmit);

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
      if (!user || !user.id || !user.email) {
        setError("Benutzerinformationen sind unvollständig. Bitte stelle sicher, dass du angemeldet bist und dein Profil eine E-Mail-Adresse enthält.");
        setIsGeneratingWithAI(false);
        return;
      }

      const formValues = getValues();
      const placeholderString = formValues.fields.map(field => `{{${field.name}}}`).join(', ');
      const finalPrompt = `${formValues.prompt.trim()}\n\nDer Benutzer stellt dir die folgenden Variablen zur Verfügung: ${placeholderString}`;
      const formSchema = { fields: formValues.fields };
      const dataToSave = {
        name: formValues.name,
        slug: formValues.slug,
        form_schema: formSchema,
        prompt: finalPrompt,
        title: formValues.title,
        description: formValues.description,
        contact_email: user.email,
        user_id: user.id
      };

      const response = await fetch(`${AUTH_BASE_URL}/auth/custom-generators`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(dataToSave),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ message: 'Failed to create generator' }));
        throw new Error(error.message || 'Fehler beim Speichern des Generators.');
      }

      const result = await response.json();
      
      // If generator was created successfully and has documents, associate them
      if (result.generator && formValues.documents && formValues.documents.length > 0) {
        try {
          const documentIds = formValues.documents.map(doc => doc.id);
          await fetch(`${AUTH_BASE_URL}/custom_generator/${result.generator.id}/documents`, {
            method: 'POST',
            credentials: 'include',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ documentIds }),
          });
          console.log(`[CreateCustomGeneratorPage] Associated ${documentIds.length} documents with generator`);
        } catch (docError) {
          console.warn('[CreateCustomGeneratorPage] Failed to associate documents:', docError);
          // Don't fail the whole process if document association fails
        }
      }
      
      setCompletionData({ name: dataToSave.name, slug: dataToSave.slug });
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
    reset(INITIAL_FORM_DATA);
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
            <FormInput
              name="name"
              label="Name des Grünerators"
              placeholder="z.B. Social Media Post Generator"
              required={true}
              control={control}
              rules={{ required: 'Der Name des Grünerators darf nicht leer sein.' }}
            />
            
            <FormInput
              name="slug"
              label="URL-Pfad"
              placeholder="z.B. social-media-post"
              required={true}
              control={control}
              rules={{
                required: 'Der URL-Pfad darf nicht leer sein.',
                pattern: {
                  value: /^[a-z0-9-]+$/,
                  message: 'Der URL-Pfad darf nur Kleinbuchstaben, Zahlen und Bindestriche enthalten.'
                }
              }}
              helpText={isCheckingSlug ? "Prüfe Verfügbarkeit..." : (slugAvailabilityError || "Nur Kleinbuchstaben, Zahlen und Bindestriche")}
              className={slugAvailabilityError ? 'error-input' : ''}
            />
            {slugAvailabilityError && (
              <InlineValidationMessage message={slugAvailabilityError} type="error" />
            )}
            
            <FormInput
              name="title"
              label="Titel"
              placeholder="Titel, der auf der Generator-Seite angezeigt wird"
              required={true}
              control={control}
              rules={{ required: 'Der Titel darf nicht leer sein.' }}
            />
            
            <FormTextarea
              name="description"
              label="Beschreibung"
              placeholder="Kurze Beschreibung des Generators und wofür er nützlich ist"
              required={true}
              control={control}
              rules={{ required: 'Die Beschreibung darf nicht leer sein.' }}
              minRows={3}
              maxRows={6}
            />
          </>
        );

      case STEPS.FIELDS:
        const currentFields = getValues('fields');
        return (
          <>
            <h3>Formularfelder definieren (max. 5)</h3>
            {!isEditingField && currentFields.length > 0 && (
              <ul className="list-group mb-3">
                {currentFields.map((field, index) => (
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
                initialFieldData={editingFieldIndex !== null ? currentFields[editingFieldIndex] : null}
                onSave={handleSaveField}
                onCancel={handleCancelEdit}
                existingFieldNames={currentFields.map(f => f.name)}
              />
            )}
            {!isEditingField && (
              <div className="add-field-controls">
                {currentFields.length < 5 && (
                  <button type="button" onClick={startAddField} className="btn btn-tanne-bordered">
                    Neues Feld hinzufügen
                  </button>
                )}
                {currentFields.length >= 5 && (
                  <p className="text-info">Maximale Anzahl von 5 Feldern erreicht.</p>
                )}
              </div>
            )}
          </>
        );

      case STEPS.DOCUMENTS:
        const currentDocuments = getValues('documents');
        return (
          <>
            <h3>Dokumente hinzufügen (optional)</h3>
            <div className="documents-step-description">
              <p>
                Hier können Sie Dokumente als Wissensquelle für Ihren Generator hinzufügen. 
                Der Generator kann dann während der Texterstellung auf Inhalte aus diesen Dokumenten zugreifen und sie zitieren.
              </p>
              <p className="help-text">
                <strong>Hinweis:</strong> Nur vollständig verarbeitete PDF-Dokumente können hinzugefügt werden.
              </p>
            </div>
            
            <DocumentSelector 
              selectedDocuments={currentDocuments}
              onDocumentsChange={(documents) => setValue('documents', documents)}
            />
          </>
        );

      case STEPS.PROMPT:
        return (
          <>
            <h3>Prompt definieren</h3>
            <FormTextarea
              name="prompt"
              label="Prompt-Vorlage"
              placeholder="Beispiel: Erstelle einen kurzen Social-Media-Post..."
              required={true}
              control={control}
              rules={{ required: 'Die Prompt-Vorlage darf nicht leer sein.' }}
              minRows={10}
              maxRows={20}
              showCharacterCount={true}
              helpText="Beschreibe genau, was die KI generieren soll. Die Formularfelder werden automatisch als Variablen übergeben."
            />
          </>
        );

      case STEPS.REVIEW:
        const reviewFormValues = getValues();
        const placeholderStringReview = reviewFormValues.fields.map(field => `{{${field.name}}}`).join(', ');
        const finalPromptReview = `${reviewFormValues.prompt.trim()}\n\nDer Benutzer stellt dir die folgenden Variablen zur Verfügung: ${placeholderStringReview}`;
        return (
          <>
            <h3>Überprüfung</h3>
            <div className="review-container">
              <div className="review-section">
                <h4>Basisdaten</h4>
                <p><strong>Name:</strong> {reviewFormValues.name}</p>
                <p><strong>URL:</strong> /generator/{reviewFormValues.slug}</p>
                <p><strong>Titel:</strong> {reviewFormValues.title}</p>
                <p><strong>Beschreibung:</strong> {reviewFormValues.description}</p>
                <p><strong>Kontakt-E-Mail:</strong> {reviewFormValues.contact_email}</p>
              </div>
              <div className="review-section">
                <h4>Formularfelder</h4>
                {reviewFormValues.fields.length > 0 ? (
                  <ul className="list-group">
                    {reviewFormValues.fields.map((field, index) => (
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
                ) : (
                  <p>Keine Felder definiert.</p>
                )}
              </div>
              <div className="review-section">
                <h4>Dokumente</h4>
                {reviewFormValues.documents && reviewFormValues.documents.length > 0 ? (
                  <ul className="list-group">
                    {reviewFormValues.documents.map((document, index) => (
                      <li key={index} className="list-group-item">
                        <strong>{document.title}</strong><br />
                        <small>
                          {document.filename} • {document.page_count} Seiten
                        </small>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>Keine Dokumente ausgewählt. Der Generator wird ohne Wissensquelle arbeiten.</p>
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
      <div className={`create-generator-page ${showHeaderFooter ? 'with-header' : ''}`}>
        <div className="container">
          <GeneratorCreationSuccessScreen
            name={completionData.name}
            slug={completionData.slug}
            onRestart={handleRestart}
          />
        </div>
      </div>
    );
  }

  // If not completed, render the StartScreen or FormSection
  if (currentStep === MODE_SELECTION) {
    return (
      <div className={`create-generator-page ${showHeaderFooter ? 'with-header' : ''}`}>
        <div className="container">
          <GeneratorStartScreen
            aiDescription={aiDescription}
            onDescriptionChange={handleAiDescriptionChange}
            onGenerateWithAI={handleGenerateWithAI}
            onManualSetup={handleManualSetup}
            isLoading={isGeneratingWithAI || aiLoading}
            error={error || aiError}
          />
        </div>
      </div>
    );
  }

  // Otherwise, render the FormSection with the current step
  return (
    <div className={`create-generator-page ${showHeaderFooter ? 'with-header' : ''}`}>
      <div className="container">
        <FormSection
          title={helpContent?.title || "Neuen Grünerator erstellen"}
          onSubmit={handleNext}
          onBack={handleBack}
          loading={isGeneratingWithAI}
          formErrors={{ general: error }}
          isFormVisible={true}
          isMultiStep={true}
          showBackButton={currentStep > STEPS.BASICS && !isEditingField}
          nextButtonText={currentStep === STEPS.REVIEW ? 'Speichern' : 'Weiter'}
          useModernForm={true}
          defaultValues={INITIAL_FORM_DATA}
          hideExtrasSection={true}
          showSubmitButtonInInputSection={true}
        >
          {renderCurrentStep()}
        </FormSection>
      </div>
    </div>
  );
};

export default CreateCustomGeneratorPage; 