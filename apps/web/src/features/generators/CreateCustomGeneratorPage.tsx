import { Card, CardContent, CardHeader, CardTitle } from '@gruenerator/ui';
import React, { useState, useEffect, useCallback, memo } from 'react';
import { useForm } from 'react-hook-form';

import FormInput from '../../components/common/Form/Input/FormInput';
import FormTextarea from '../../components/common/Form/Input/FormTextarea';
import SubmitButton from '../../components/common/SubmitButton';
import useApiSubmit from '../../components/hooks/useApiSubmit';
import { ProfileIconButton } from '../../components/profile/actions/ProfileActionButton';
import { useAuthStore } from '../../stores/authStore';
import { type CustomGenerator, profileApiService } from '../auth/services/profileApiService';

import FieldEditorAssistant from './components/FieldEditorAssistant';
import GeneratorCreationSuccessScreen from './components/GeneratorCreationSuccessScreen';
import GeneratorStartScreen from './components/GeneratorStartScreen';
import { getCustomGeneratorHelpContent } from './constants/customGeneratorHelpContent';
import { MODE_SELECTION, INITIAL_GENERATOR_FORM_DATA } from './constants/generatorConstants';
import { STEPS } from './constants/steps';
import { useSlugAvailability } from './hooks/useSlugAvailability';
import { type GeneratorFormField, type GeneratorFormData } from './types/generatorTypes';
import { sanitizeSlug } from './utils/sanitization';

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
  generators?: CustomGenerator[];
  savedGenerators?: CustomGenerator[];
  onSelectGenerator?: (generator: CustomGenerator) => void;
  onDeleteGenerator?: () => void;
  onGeneratorUpdated?: () => void;
}

interface CompletionData {
  slug: string;
  name: string;
  [key: string]: unknown;
}

const fieldBadgeClasses =
  'inline-block py-0.5 px-2 rounded-full bg-[var(--secondary)] text-primary-600 text-xs font-semibold';
const fieldListItemClasses =
  'grid grid-cols-[1fr_auto] items-center gap-sm py-3 px-md bg-transparent text-foreground [&+li]:border-t [&+li]:border-grey-200 dark:[&+li]:border-grey-700 max-[600px]:grid-cols-1';
const fieldTitleClasses =
  'inline-flex items-center gap-xs font-semibold text-foreground-heading whitespace-nowrap overflow-hidden text-ellipsis';
const fieldMetaClasses = 'text-grey-400 text-sm leading-relaxed mt-1 break-words';

// Embedded-only component; use in profile tab
const CreateCustomGeneratorPage: React.FC<CreateCustomGeneratorPageProps> = memo(
  ({
    onCompleted,
    onCancel,
    generators = [],
    savedGenerators = [],
    onSelectGenerator,
    onDeleteGenerator,
    onGeneratorUpdated,
  }) => {
    const [currentStep, setCurrentStep] = useState<number>(MODE_SELECTION);
    const [aiDescription, setAiDescription] = useState<string>('');
    const [isGeneratingWithAI, setIsGeneratingWithAI] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);
    const [completionData, setCompletionData] = useState<CompletionData | null>(null);
    const user = useAuthStore((s) => s.user);

    // React Hook Form setup
    const {
      control,
      handleSubmit,
      watch,
      setValue,
      getValues,
      formState: { errors },
      reset,
    } = useForm<GeneratorFormData>({
      defaultValues: INITIAL_GENERATOR_FORM_DATA,
      mode: 'onChange',
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
      resetSuccess: resetAISuccess,
    } = useApiSubmit('/generate_generator_config');

    // Use custom hook for slug availability checking
    const { isChecking: isCheckingSlug, error: slugAvailabilityError } = useSlugAvailability({
      slug: watchedSlug,
    });

    // State for managing the field editor assistant
    const [isEditingField, setIsEditingField] = useState<boolean>(false);
    const [editingFieldIndex, setEditingFieldIndex] = useState<number | null>(null);

    // Set initial contact_email if user is logged in
    useEffect(() => {
      if (user && user.email) {
        setValue('contact_email', user.email);
      }
    }, [user, setValue]);

    // Handler for AI description
    const handleAiDescriptionChange = useCallback((value: string) => {
      setAiDescription(value);
      setError(null);
    }, []);

    // Handler for AI generation
    const handleGenerateWithAI = useCallback(async () => {
      setError(null);
      setIsGeneratingWithAI(true);

      try {
        const response = await submitAIGeneration({ description: aiDescription });
        const generatedConfig = response as unknown as AIGeneratedConfig;

        if (
          generatedConfig &&
          generatedConfig.name &&
          generatedConfig.slug &&
          generatedConfig.fields &&
          generatedConfig.prompt
        ) {
          reset({
            name: generatedConfig.name,
            slug: generatedConfig.slug,
            fields: generatedConfig.fields,
            prompt: generatedConfig.prompt,
            title: generatedConfig.title || '',
            description: generatedConfig.description || '',
            contact_email: generatedConfig.contact_email || '',
          });
          setCurrentStep(STEPS.BASICS);
          setAiDescription('');
        } else {
          setError(
            'Fehler: Die von der KI generierte Konfiguration ist unvollständig oder ungültig.'
          );
        }
      } catch (err) {
        console.error('[CreateCustom] Error during AI generation:', err);
        const errorMessage = err instanceof Error ? err.message : 'Unbekannter Fehler';
        setError(aiError || `Fehler bei der KI-Generierung: ${errorMessage}`);
      } finally {
        setIsGeneratingWithAI(false);
      }
    }, [aiDescription, submitAIGeneration, reset, aiError]);

    // Field management
    const startAddField = useCallback(() => {
      const currentFields = getValues('fields');
      if (currentFields.length < 5) {
        setEditingFieldIndex(null);
        setIsEditingField(true);
      }
    }, [getValues]);

    const startEditField = useCallback((index: number) => {
      setEditingFieldIndex(index);
      setIsEditingField(true);
    }, []);

    const handleSaveField = useCallback(
      (fieldData: GeneratorFormField) => {
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
      },
      [getValues, setValue, editingFieldIndex]
    );

    const handleCancelEdit = useCallback(() => {
      setIsEditingField(false);
      setEditingFieldIndex(null);
    }, []);

    const deleteField = useCallback(
      (index: number) => {
        const currentFields = getValues('fields');
        setValue(
          'fields',
          currentFields.filter((_, i) => i !== index)
        );
      },
      [getValues, setValue]
    );

    // Validation - only handle special cases not covered by React Hook Form
    const validateStep = useCallback(async () => {
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
    }, [currentStep, slugAvailabilityError, isCheckingSlug, isEditingField]);

    // Save
    const handleSave = useCallback(async () => {
      setIsGeneratingWithAI(true);
      setError(null);
      try {
        if (!user || !user.id || !user.email) {
          setError(
            'Benutzerinformationen sind unvollständig. Bitte stelle sicher, dass du angemeldet bist und dein Profil eine E-Mail-Adresse enthält.'
          );
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
        console.error('Error saving generator:', err);
        const errorMessage = err instanceof Error ? err.message : 'Unbekannter Fehler';
        setError(`Fehler beim Speichern: ${errorMessage}`);
      } finally {
        setIsGeneratingWithAI(false);
      }
    }, [user, getValues, onCompleted]);

    // Navigation with React Hook Form
    const onSubmit = useCallback(
      async (_data: GeneratorFormData) => {
        const isValid = await validateStep();
        if (!isValid) {
          return;
        }
        if (currentStep < STEPS.REVIEW) {
          setCurrentStep(currentStep + 1);
        } else {
          void handleSave();
        }
      },
      [validateStep, currentStep, handleSave]
    );

    // Navigation
    const handleNext = handleSubmit(onSubmit);

    const handleBack = useCallback(() => {
      setError(null);
      if (currentStep > STEPS.BASICS) {
        setCurrentStep(currentStep - 1);
      }
    }, [currentStep]);

    // Restart the creation process
    const handleRestart = useCallback(() => {
      setCurrentStep(MODE_SELECTION);
      reset(INITIAL_GENERATOR_FORM_DATA);
      setAiDescription('');
      setError(null);
      setCompletionData(null);
      setIsEditingField(false);
      setEditingFieldIndex(null);
      resetAISuccess();
    }, [reset, resetAISuccess]);

    // Render current step content
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
                    message:
                      'Der URL-Pfad darf nur Kleinbuchstaben, Zahlen und Bindestriche enthalten.',
                  },
                }}
                helpText={
                  isCheckingSlug
                    ? 'Prüfe Verfügbarkeit...'
                    : slugAvailabilityError || 'Nur Kleinbuchstaben, Zahlen und Bindestriche'
                }
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
                <ul className="list-none p-0 my-lg rounded-lg bg-[var(--card-background)] shadow-sm border border-grey-200 dark:border-grey-700 mb-md">
                  {currentFields.map((field, index) => (
                    <li key={index} className={fieldListItemClasses}>
                      <div>
                        <div className={fieldTitleClasses}>
                          {field.label || '(Ohne Label)'}
                          <span className={fieldBadgeClasses}>
                            {field.type === 'textarea' ? 'Langer Text' : 'Kurzer Text'}
                          </span>
                          {field.required && (
                            <span className={fieldBadgeClasses} aria-label="Pflichtfeld">
                              Pflichtfeld
                            </span>
                          )}
                        </div>
                        {field.placeholder && (
                          <div className={fieldMetaClasses}>{field.placeholder}</div>
                        )}
                      </div>
                      <div className="inline-flex gap-xs">
                        <ProfileIconButton
                          action="edit"
                          ariaLabel="Bearbeiten"
                          title="Bearbeiten"
                          onClick={() => startEditField(index)}
                        />
                        <ProfileIconButton
                          action="delete"
                          ariaLabel="Löschen"
                          title="Löschen"
                          onClick={() => deleteField(index)}
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              {isEditingField && (
                <FieldEditorAssistant
                  initialFieldData={
                    editingFieldIndex !== null ? currentFields[editingFieldIndex] : null
                  }
                  onSave={handleSaveField}
                  onCancel={handleCancelEdit}
                  existingFieldNames={currentFields.map((f) => f.name)}
                />
              )}
              {!isEditingField && (
                <div className="mt-lg">
                  {currentFields.length < 5 && (
                    <button
                      type="button"
                      onClick={startAddField}
                      className="px-5 py-2.5 bg-transparent border-2 border-grey-200 dark:border-grey-700 text-foreground rounded-[10px] font-semibold cursor-pointer transition-all duration-200 hover:bg-background-alt"
                    >
                      Neues Feld hinzufügen
                    </button>
                  )}
                  {currentFields.length >= 5 && (
                    <p className="text-sm text-primary-600">
                      Maximale Anzahl von 5 Feldern erreicht.
                    </p>
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
          const placeholderStringReview = reviewFormValues.fields
            .map((field) => `{{${field.name}}}`)
            .join(', ');
          const finalPromptReview = `${reviewFormValues.prompt.trim()}\n\nDer Benutzer stellt dir die folgenden Variablen zur Verfügung: ${placeholderStringReview}`;
          return (
            <>
              <h3>Überprüfung</h3>
              <div className="p-lg mt-lg border border-grey-200 dark:border-grey-700 rounded-lg bg-[var(--card-background)]">
                <div className="mb-lg">
                  <h4 className="text-foreground-heading mb-md font-semibold">Basisdaten</h4>
                  <p>
                    <strong>Name:</strong> {reviewFormValues.name}
                  </p>
                  <p>
                    <strong>URL:</strong> /gruenerator/{reviewFormValues.slug}
                  </p>
                  <p>
                    <strong>Titel:</strong> {reviewFormValues.title}
                  </p>
                  <p>
                    <strong>Beschreibung:</strong> {reviewFormValues.description}
                  </p>
                  <p>
                    <strong>Kontakt-E-Mail:</strong> {reviewFormValues.contact_email}
                  </p>
                </div>
                <div className="mb-lg border-t border-grey-200 dark:border-grey-700 pt-lg">
                  <h4 className="text-foreground-heading mb-md font-semibold">Formularfelder</h4>
                  {reviewFormValues.fields.length > 0 ? (
                    <ul className="list-none p-0 my-lg rounded-lg bg-[var(--card-background)] shadow-sm border border-grey-200 dark:border-grey-700">
                      {reviewFormValues.fields.map((field, index) => (
                        <li key={index} className={fieldListItemClasses}>
                          <div>
                            <div className={fieldTitleClasses}>
                              {field.label}
                              <span className={fieldBadgeClasses}>
                                {field.type === 'textarea'
                                  ? 'Langer Text'
                                  : field.type === 'select'
                                    ? 'Auswahlfeld'
                                    : 'Kurzer Text'}
                              </span>
                              {field.required && (
                                <span className={fieldBadgeClasses} aria-label="Pflichtfeld">
                                  Pflichtfeld
                                </span>
                              )}
                            </div>
                            {field.placeholder && (
                              <div className={fieldMetaClasses}>{field.placeholder}</div>
                            )}
                            {field.type === 'select' &&
                              field.options &&
                              field.options.length > 0 && (
                                <div className={fieldMetaClasses}>
                                  Optionen: {field.options.map((opt) => opt.label).join(', ')}
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
                <div className="border-t border-grey-200 dark:border-grey-700 pt-lg">
                  <h4 className="text-foreground-heading mb-md font-semibold">Prompt</h4>
                  <pre className="p-md rounded-md border border-grey-200 dark:border-grey-700 whitespace-pre-wrap break-words text-foreground font-mono text-sm bg-background">
                    {finalPromptReview}
                  </pre>
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
          isLoading={isGeneratingWithAI || aiLoading}
          error={error || aiError}
          generators={generators}
          savedGenerators={savedGenerators}
          onSelectGenerator={onSelectGenerator}
          onDeleteGenerator={onDeleteGenerator}
          onGeneratorUpdated={onGeneratorUpdated}
        />
      );
    }

    // Otherwise, render the card form with the current step
    const showBackButton = currentStep > STEPS.BASICS && !isEditingField;
    const nextButtonText = currentStep === STEPS.REVIEW ? 'Speichern' : 'Weiter';

    return (
      <div className="@container/form-section relative">
        <div className="form-section flex flex-col min-h-[400px] bg-[var(--card-background)] text-foreground max-md:min-h-[300px] max-md:mt-md xl:min-h-[450px]">
          <Card className="overflow-hidden shadow-card-elevated transition-all duration-250 flex flex-col rounded-md forced-colors:border-[ButtonText] forced-colors:bg-[ButtonFace]">
            <CardHeader className="flex-row justify-between items-center border-b border-grey-200 dark:border-grey-700 py-md px-xl max-md:px-md max-md:py-md">
              <CardTitle className="text-[1.4em]">
                {helpContent?.title || 'Neuen Custom Grünerator erstellen'}
              </CardTitle>
            </CardHeader>
            <CardContent className="flex-1 flex flex-col p-lg max-md:p-md max-[480px]:p-sm">
              <form
                onSubmit={(e: React.FormEvent) => {
                  e.preventDefault();
                  handleNext();
                }}
                className="flex flex-col h-full"
              >
                <div className="flex-[2] min-w-0 min-h-0">
                  <div className="flex-1 flex flex-col min-h-0">
                    <div className="flex-1 mb-lg min-h-0 form-content">{renderCurrentStep()}</div>
                    <div className="flex gap-md justify-end items-center pt-md border-t border-grey-200 dark:border-grey-700 mt-auto max-md:flex-col max-md:gap-sm">
                      {showBackButton && (
                        <button
                          type="button"
                          onClick={handleBack}
                          className="bg-transparent border-2 border-[var(--interactive-accent-color)] text-[var(--interactive-accent-color)] px-lg py-sm rounded-sm text-[0.9em] cursor-pointer transition-all duration-250 hover:bg-[var(--interactive-accent-color)] hover:text-background-pure focus:outline-2 focus:outline-[var(--interactive-accent-color)] focus:outline-offset-2 max-md:w-full max-md:text-center"
                        >
                          Zurück
                        </button>
                      )}
                      <SubmitButton
                        onClick={(e: React.MouseEvent) => {
                          e.preventDefault();
                          handleNext();
                        }}
                        loading={isGeneratingWithAI}
                        text={nextButtonText}
                        className="form-inputs__submit-button button-primary"
                        ariaLabel={nextButtonText}
                        type="submit"
                      />
                    </div>
                  </div>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }
);

CreateCustomGeneratorPage.displayName = 'CreateCustomGeneratorPage';

export default CreateCustomGeneratorPage;
