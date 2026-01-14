import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import FormSection from '../../components/common/Form/BaseForm/FormSection';
import FormStateProvider from '../../components/common/Form/FormStateProvider';
import FormInput from '../../components/common/Form/Input/FormInput';
import FormTextarea from '../../components/common/Form/Input/FormTextarea';
import FieldEditorAssistant from './components/FieldEditorAssistant';
import { getCustomGeneratorHelpContent } from './constants/customGeneratorHelpContent';
import { STEPS } from './constants/steps';
import useApiSubmit from '../../components/hooks/useApiSubmit';
import { profileApiService } from '../auth/services/profileApiService';
import GeneratorStartScreen from './components/GeneratorStartScreen';
import GeneratorCreationSuccessScreen from './components/GeneratorCreationSuccessScreen';

import '../../assets/styles/components/custom-generator/create-custom-generator.css';
import '../../assets/styles/components/custom-generator/field-editor-assistant.css';
import '../../assets/styles/components/custom-generator/document-selector.css';
import './styles/custom-generators-tab.css';
import { useOptimizedAuth } from '../../hooks/useAuth';
import { ProfileIconButton } from '../../components/profile/actions/ProfileActionButton';
import { GeneratorFormField, GeneratorFormData } from './types/generatorTypes';
import { MODE_SELECTION, INITIAL_GENERATOR_FORM_DATA } from './constants/generatorConstants';
import { sanitizeSlug } from './utils/sanitization';
import { useSlugAvailability } from './hooks/useSlugAvailability';
import type { Control } from 'react-hook-form';

interface AIGeneratedConfig {
  name: string;
  slug: string;
  fields: GeneratorFormField[];
  prompt: string;
  title?: string;
  description?: string;
  contact_email?: string;
}

interface CreateCustomGeneratorPageProps {
  onCompleted?: (data?: { name: string; slug: string }) => void;
  onCancel?: () => void;
}

interface CompletionData {
  slug: string;
  name: string;
  [key: string]: unknown;
}

// Embedded-only component; use in profile tab
const CreateCustomGeneratorPage: React.FC<CreateCustomGeneratorPageProps> = ({ onCompleted, onCancel }) => {
  const [currentStep, setCurrentStep] = useState<number>(MODE_SELECTION);
  const [aiDescription, setAiDescription] = useState<string>('');
  const [isGeneratingWithAI, setIsGeneratingWithAI] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [completionData, setCompletionData] = useState<CompletionData | null>(null);
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
  } = useForm<GeneratorFormData>({
    defaultValues: INITIAL_GENERATOR_FORM_DATA,
    mode: 'onChange'
  });

  // Watch slug for debouncing and processing
  const watchedSlug = watch('slug');

  // Effect to process slug input
  useEffect(() => {
    if (watchedSlug) {
      const processedSlug = sanitizeSlug(watchedSlug);
      if (processedSlug !== watchedSlug) {
        setValue('slug', processedSlug);
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

  // Use custom hook for slug availability checking
  const { isChecking: isCheckingSlug, error: slugAvailabilityError } = useSlugAvailability({ slug: watchedSlug });

  // State for managing the field editor assistant
  const [isEditingField, setIsEditingField] = useState<boolean>(false);
  const [editingFieldIndex, setEditingFieldIndex] = useState<number | null>(null);

  // Set initial contact_email if user is logged in
  useEffect(() => {
    if (user && user.email) {
      setValue('contact_email', user.email);
    }
  }, [user, setValue]);

  // Handler for clearing errors when inputs change
  const handleInputChange = () => {
    setError(null);
  };

  // Handler for AI description
  const handleAiDescriptionChange = (value: string) => {
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
      const response = await submitAIGeneration({ description: aiDescription });
      const generatedConfig = response as unknown as AIGeneratedConfig;

      if (generatedConfig && generatedConfig.name && generatedConfig.slug && generatedConfig.fields && generatedConfig.prompt) {
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
      const errorMessage = err instanceof Error ? err.message : 'Unbekannter Fehler';
      setError(aiError || `Fehler bei der KI-Generierung: ${errorMessage}`);
    } finally {
      setIsGeneratingWithAI(false);
    }
  };

  // Field management
  const startAddField = () => {
    const currentFields = getValues('fields');
    if (currentFields.length < 5) {
      setEditingFieldIndex(null);
      setIsEditingField(true);
    }
  };

  const startEditField = (index: number) => {
    setEditingFieldIndex(index);
    setIsEditingField(true);
  };

  const handleSaveField = (fieldData: GeneratorFormField) => {
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

  const deleteField = (index: number) => {
    const currentFields = getValues('fields');
    setValue('fields', currentFields.filter((_, i) => i !== index));
  };

  // Validation - only handle special cases not covered by React Hook Form
  const validateStep = async () => {
    setError(null);

    // Special validations that React Hook Form doesn't handle
    switch (currentStep) {
      case STEPS.BASICS:
        // Only check slug availability (async validation)
        if (slugAvailabilityError) {
          setError(slugAvailabilityError);
          return false;
        }
        if (isCheckingSlug) {
          setError('Die Verfügbarkeit des URL-Pfads wird noch geprüft...');
          return false;
        }
        return true;

      case STEPS.FIELDS:
        if (isEditingField) {
          setError('Bitte schließe zuerst den Feld-Editor (Speichern oder Abbrechen).');
          return false;
        }
        return true;

      // case STEPS.DOCUMENTS:
        // Documents are optional, so always valid
        // return true;

      case STEPS.PROMPT:
      case STEPS.REVIEW:
        return true;

      default:
        return true;
    }
  };

  // Navigation with React Hook Form
  const onSubmit = async (_data: GeneratorFormData) => {
    const isValid = await validateStep();
    if (!isValid) {
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

  const handleBack = () => {
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
      const formSchema = { fields: formValues.fields };

      const dataToSave = {
        name: formValues.name,
        slug: formValues.slug,
        form_schema: formSchema,
        prompt: formValues.prompt.trim(),
        title: formValues.title,
        description: formValues.description,
        contact_email: formValues.contact_email || user.email,
      };

      const result = await profileApiService.createCustomGenerator(dataToSave);

      if (!result.success) {
        throw new Error(result.message || 'Fehler beim Speichern des Generators.');
      }

      setCompletionData({ name: dataToSave.name, slug: dataToSave.slug });
      // Notify parent immediately so it can refresh lists
      if (onCompleted) {
        onCompleted({ name: dataToSave.name, slug: dataToSave.slug });
      }
    } catch (err) {
      console.error("Error saving generator:", err);
      const errorMessage = err instanceof Error ? err.message : 'Unbekannter Fehler';
      setError(`Fehler beim Speichern: ${errorMessage}`);
    } finally {
      setIsGeneratingWithAI(false);
    }
  };

  // Restart the creation process
  const handleRestart = () => {
    setCurrentStep(MODE_SELECTION);
    reset(INITIAL_GENERATOR_FORM_DATA);
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
              control={control as unknown as Control<Record<string, unknown>>}
              rules={{ required: 'Der Name des Grünerators darf nicht leer sein.' }}
            />

            <FormInput
              name="slug"
              label="URL-Pfad"
              placeholder="z.B. social-media-post"
              required={true}
              control={control as unknown as Control<Record<string, unknown>>}
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
            {/* Inline validation message is reflected via helpText and input styling */}

            <FormInput
              name="title"
              label="Titel"
              placeholder="Titel, der auf der Generator-Seite angezeigt wird"
              required={true}
              control={control as unknown as Control<Record<string, unknown>>}
              rules={{ required: 'Der Titel darf nicht leer sein.' }}
            />

            <FormTextarea
              name="description"
              label="Beschreibung"
              placeholder="Kurze Beschreibung des Generators und wofür er nützlich ist"
              required={true}
              control={control as unknown as Control<Record<string, unknown>>}
              rules={{ required: 'Die Beschreibung darf nicht leer sein.' }}
              minRows={3}
              maxRows={6}
            />
          </>
        );

      case STEPS.FIELDS:
        const currentFields = watch('fields');
        return (
          <>
            {/* Heading removed to avoid duplication with FormSection title */}
            {!isEditingField && currentFields.length > 0 && (
              <ul className="list-group list-group--modern mb-3">
                {currentFields.map((field, index) => (
                  <li key={index} className="list-group-item">
                    <div>
                      <div className="list-group-item__title">
                        {field.label || '(Ohne Label)'}
                        <span className="list-group-item__badge badge--field">
                          {field.type === 'textarea' ? 'Langer Text' : 'Kurzer Text'}
                        </span>
                        {field.required && (
                          <span className="list-group-item__badge" aria-label="Pflichtfeld">Pflichtfeld</span>
                        )}
                      </div>
                      {field.placeholder && (
                        <div className="list-group-item__meta">{field.placeholder}</div>
                      )}
                    </div>
                    <div className="list-group-item__actions">
                      <ProfileIconButton action="edit" ariaLabel="Bearbeiten" title="Bearbeiten" onClick={() => startEditField(index)} />
                      <ProfileIconButton action="delete" ariaLabel="Löschen" title="Löschen" onClick={() => deleteField(index)} />
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

      case STEPS.PROMPT:
        return (
          <>
            <FormTextarea
              name="prompt"
              label="Prompt-Vorlage"
              placeholder="Beispiel: Erstelle einen kurzen Social-Media-Post..."
              required={true}
              control={control as unknown as Control<Record<string, unknown>>}
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
                <p><strong>URL:</strong> /gruenerator/{reviewFormValues.slug}</p>
                <p><strong>Titel:</strong> {reviewFormValues.title}</p>
                <p><strong>Beschreibung:</strong> {reviewFormValues.description}</p>
                <p><strong>Kontakt-E-Mail:</strong> {reviewFormValues.contact_email}</p>
              </div>
              <div className="review-section">
                <h4>Formularfelder</h4>
                {reviewFormValues.fields.length > 0 ? (
                  <ul className="list-group list-group--modern">
                    {reviewFormValues.fields.map((field, index) => (
                      <li key={index} className="list-group-item">
                        <div>
                          <div className="list-group-item__title">
                            {field.label}
                            <span className="list-group-item__badge badge--field">
                              {field.type === 'textarea' ? 'Langer Text' :
                               field.type === 'select' ? 'Auswahlfeld' : 'Kurzer Text'}
                            </span>
                            {field.required && (
                              <span className="list-group-item__badge" aria-label="Pflichtfeld">Pflichtfeld</span>
                            )}
                          </div>
                          {field.placeholder && (
                            <div className="list-group-item__meta">{field.placeholder}</div>
                          )}
                          {field.type === 'select' && field.options && field.options.length > 0 && (
                            <div className="list-group-item__meta">
                              Optionen: {field.options.map(opt => opt.label).join(', ')}
                            </div>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>Keine Felder definiert.</p>
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
      <div>
        <GeneratorCreationSuccessScreen
          name={completionData.name}
          slug={completionData.slug}
          onRestart={handleRestart}
          // Provide a simple way to close when embedded
          onClose={onCancel}
        />
      </div>
    );
  }

  // If not completed, render the StartScreen or FormSection
  if (currentStep === MODE_SELECTION) {
    return (
      <GeneratorStartScreen
        aiDescription={aiDescription}
        onDescriptionChange={handleAiDescriptionChange}
        onGenerateWithAI={handleGenerateWithAI}
        onManualSetup={handleManualSetup}
        isLoading={isGeneratingWithAI || aiLoading}
        error={error || aiError}
      />
    );
  }

  // Otherwise, render the FormSection with the current step
  return (
    <FormStateProvider
      initialState={{
        loading: isGeneratingWithAI,
        formErrors: { general: error || '' },
        isFormVisible: true
      }}
      formId="create-custom-generator"
    >
      <FormSection
        title={helpContent?.title || "Neuen Custom Grünerator erstellen"}
        onSubmit={handleNext}
        onBack={handleBack}
        isFormVisible={true}
        isMultiStep={true}
        showBackButton={currentStep > STEPS.BASICS && !isEditingField}
        nextButtonText={currentStep === STEPS.REVIEW ? 'Speichern' : 'Weiter'}
        useModernForm={true}
        formControl={{ control: control as unknown as Control<Record<string, unknown>>, setValue: setValue as unknown as (name: string, value: unknown) => void, getValues: getValues as unknown as () => Record<string, unknown>, formState: { errors, isDirty: false, isValid: true } }}
        defaultValues={INITIAL_GENERATOR_FORM_DATA as unknown as Record<string, unknown>}
        hideExtrasSection={true}
        showSubmitButtonInInputSection={true}
      >
        {renderCurrentStep()}
      </FormSection>
    </FormStateProvider>
  );
};

export default CreateCustomGeneratorPage;
