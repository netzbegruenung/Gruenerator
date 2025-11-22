import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useForm, FormProvider } from 'react-hook-form';

// Common components
import ProfileCard from '../../../../../../../components/common/ProfileCard';

// Hooks
import { useAutosave } from '../../../../../../../hooks/useAutosave';
import { useFormFields } from '../../../../../../../components/common/Form/hooks';
import { useMessageHandling } from '../../../../../../../hooks/useMessageHandling';
import { useAnweisungenWissen } from '../../../../../hooks/useProfileData';

const AnweisungenSection = ({
    isActive,
    onSuccessMessage,
    onErrorMessage
}) => {
    // Ref to track initialization
    const isInitialized = useRef(false);

    // Message handling
    const { clearMessages, showSuccess, showError } = useMessageHandling(onSuccessMessage, onErrorMessage);

    // React Query hook for data fetching and mutations
    const { query, saveChanges, isSaving } = useAnweisungenWissen({ isActive });
    const { data, isError: isErrorQuery, error: errorQuery } = query;

    // React Hook Form setup
    const formMethods = useForm({
        defaultValues: {
            customAntragPrompt: '',
            customSocialPrompt: '',
            customUniversalPrompt: '',
            customGruenejugendPrompt: '',
            customRedePrompt: '',
            customBuergeranfragenPrompt: '',
        },
        mode: 'onChange'
    });

    const { control, getValues, reset, watch } = formMethods;
    const { Textarea } = useFormFields();

    // Track autosave enabled state
    const [autosaveEnabled, setAutosaveEnabled] = useState(false);

    // Auto-save using shared hook
    const { resetTracking } = useAutosave({
        saveFunction: useCallback(async (changedFields) => {
            const currentValues = getValues();
            const formData = {
                customAntragPrompt: changedFields.customAntragPrompt !== undefined ? changedFields.customAntragPrompt : currentValues.customAntragPrompt || '',
                customSocialPrompt: changedFields.customSocialPrompt !== undefined ? changedFields.customSocialPrompt : currentValues.customSocialPrompt || '',
                customUniversalPrompt: changedFields.customUniversalPrompt !== undefined ? changedFields.customUniversalPrompt : currentValues.customUniversalPrompt || '',
                customGruenejugendPrompt: changedFields.customGruenejugendPrompt !== undefined ? changedFields.customGruenejugendPrompt : currentValues.customGruenejugendPrompt || '',
                customRedePrompt: changedFields.customRedePrompt !== undefined ? changedFields.customRedePrompt : currentValues.customRedePrompt || '',
                customBuergeranfragenPrompt: changedFields.customBuergeranfragenPrompt !== undefined ? changedFields.customBuergeranfragenPrompt : currentValues.customBuergeranfragenPrompt || '',
                knowledge: currentValues.knowledge || []
            };

            try {
                const result = await saveChanges(formData);
                showSuccess('Änderungen wurden automatisch gespeichert');
                return result;
            } catch (error) {
                showError('Fehler beim automatischen Speichern: ' + error.message);
                throw error;
            }
        }, [saveChanges, getValues, showSuccess, showError]),
        formRef: { getValues, watch },
        enabled: autosaveEnabled,
        debounceMs: 2000,
        getFieldsToTrack: () => [
            'customAntragPrompt',
            'customSocialPrompt',
            'customUniversalPrompt',
            'customGruenejugendPrompt',
            'customRedePrompt',
            'customBuergeranfragenPrompt'
        ],
        onError: () => {
            showError('Fehler beim automatischen Speichern');
        }
    });

    // Initialize form when data loads (only once)
    useEffect(() => {
        if (!data || isInitialized.current) return;

        const formData = {
            customAntragPrompt: data.antragPrompt || '',
            customSocialPrompt: data.socialPrompt || '',
            customUniversalPrompt: data.universalPrompt || '',
            customGruenejugendPrompt: data.gruenejugendPrompt || '',
            customRedePrompt: data.redePrompt || '',
            customBuergeranfragenPrompt: data.buergeranfragenPrompt || '',
        };

        reset(formData);
        isInitialized.current = true;

        // Enable autosave and reset tracking after initial form setup
        setTimeout(() => {
            setAutosaveEnabled(true);
            resetTracking();
        }, 100);
    }, [data, reset, resetTracking]);

    // Effect to clear messages when component becomes inactive
    useEffect(() => {
        clearMessages();
    }, [isActive, clearMessages]);

    if (isErrorQuery) {
        return (
            <div className="auth-error-message error-message-container error-large-margin">
                Fehler beim Laden der Daten: {errorQuery.message}
            </div>
        );
    }

    return (
        <FormProvider {...formMethods}>
            <div
                role="tabpanel"
                id="anweisungen-panel"
                aria-labelledby="anweisungen-tab"
                tabIndex={-1}
                className="profile-cards-grid"
            >
                <ProfileCard title="Anweisungen für Anträge">
                    <Textarea
                        name="customAntragPrompt"
                        label="Persönliche Anweisungen:"
                        placeholder="Gib hier deine Anweisungen für die Erstellung von Anträgen ein..."
                        helpText="z.B. bevorzugter Stil, spezielle Formulierungen, politische Schwerpunkte"
                        minRows={2}
                        maxRows={8}
                        control={control}
                    />
                </ProfileCard>
                <ProfileCard title="Anweisungen für Presse & Social Media">
                    <Textarea
                        name="customSocialPrompt"
                        label="Persönliche Anweisungen:"
                        placeholder="Gib hier deine Anweisungen für die Erstellung von Presse- und Social Media-Inhalten ein..."
                        helpText="z.B. Tonalität, Hashtag-Präferenzen, Zielgruppen-Ansprache"
                        minRows={2}
                        maxRows={8}
                        control={control}
                    />
                </ProfileCard>
                <ProfileCard title="Anweisungen für Universelle Texte">
                    <Textarea
                        name="customUniversalPrompt"
                        label="Persönliche Anweisungen:"
                        placeholder="Gib hier deine Anweisungen für die Erstellung von universellen Texten ein..."
                        helpText="z.B. allgemeine Schreibweise, politische Grundhaltung, Formulierungspräferenzen"
                        minRows={2}
                        maxRows={8}
                        control={control}
                    />
                </ProfileCard>
                <ProfileCard title="Anweisungen für Reden">
                    <Textarea
                        name="customRedePrompt"
                        label="Persönliche Anweisungen:"
                        placeholder="Gib hier deine Anweisungen für die Erstellung von Reden ein..."
                        helpText="z.B. bevorzugter Redestil, rhetorische Mittel, Ansprache der Zielgruppe"
                        minRows={2}
                        maxRows={8}
                        control={control}
                    />
                </ProfileCard>
                <ProfileCard title="Anweisungen für Bürger*innenanfragen">
                    <Textarea
                        name="customBuergeranfragenPrompt"
                        label="Persönliche Anweisungen:"
                        placeholder="Gib hier deine Anweisungen für die Beantwortung von Bürger*innenanfragen ein..."
                        helpText="z.B. bevorzugte Tonalität, Detailgrad, Ansprechpartner-Informationen"
                        minRows={2}
                        maxRows={8}
                        control={control}
                    />
                </ProfileCard>
                <ProfileCard title="Anweisungen für Grüne Jugend">
                    <Textarea
                        name="customGruenejugendPrompt"
                        label="Persönliche Anweisungen:"
                        placeholder="Gib hier deine Anweisungen für die Erstellung von Grüne Jugend-Inhalten ein..."
                        helpText="z.B. jugendgerechte Sprache, spezielle Themen, Aktivismus-Fokus"
                        minRows={2}
                        maxRows={8}
                        control={control}
                    />
                </ProfileCard>

                <div className="form-help-text">
                    Änderungen werden automatisch gespeichert
                </div>
            </div>
        </FormProvider>
    );
};

export default AnweisungenSection;
