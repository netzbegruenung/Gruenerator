import { useEffect, useState, useCallback, useRef } from 'react';
import { useForm, FormProvider } from 'react-hook-form';
import { useAutosave } from '../../../../../../../hooks/useAutosave';
import { useMessageHandling } from '../../../../../../../hooks/useMessageHandling';
import { useAnweisungenWissen } from '../../../../../hooks/useProfileData';
import { InstructionsGrid, INSTRUCTION_FIELDS } from '../../../../../../../components/common/InstructionFields';

const AnweisungenSection = ({
    isActive,
    onSuccessMessage,
    onErrorMessage
}) => {
    const isInitialized = useRef(false);
    const [enabledFields, setEnabledFields] = useState([]);

    const { clearMessages, showSuccess, showError } = useMessageHandling(onSuccessMessage, onErrorMessage);

    const { query, saveChanges, isSaving } = useAnweisungenWissen({ isActive });
    const { data, isError: isErrorQuery, error: errorQuery } = query;

    const defaultValues = INSTRUCTION_FIELDS.reduce((acc, field) => {
        acc[field.name] = '';
        return acc;
    }, {});

    const formMethods = useForm({
        defaultValues,
        mode: 'onChange'
    });

    const { control, getValues, reset, watch, setValue } = formMethods;

    const [autosaveEnabled, setAutosaveEnabled] = useState(false);

    const { resetTracking } = useAutosave({
        saveFunction: useCallback(async (changedFields) => {
            const currentValues = getValues();
            const formData = {
                customAntragPrompt: changedFields.customAntragPrompt !== undefined ? changedFields.customAntragPrompt : currentValues.customAntragPrompt || '',
                customSocialPrompt: changedFields.customSocialPrompt !== undefined ? changedFields.customSocialPrompt : currentValues.customSocialPrompt || '',
                customUniversalPrompt: changedFields.customUniversalPrompt !== undefined ? changedFields.customUniversalPrompt : currentValues.customUniversalPrompt || '',
                customRedePrompt: changedFields.customRedePrompt !== undefined ? changedFields.customRedePrompt : currentValues.customRedePrompt || '',
                customBuergeranfragenPrompt: changedFields.customBuergeranfragenPrompt !== undefined ? changedFields.customBuergeranfragenPrompt : currentValues.customBuergeranfragenPrompt || '',
                customGruenejugendPrompt: changedFields.customGruenejugendPrompt !== undefined ? changedFields.customGruenejugendPrompt : currentValues.customGruenejugendPrompt || '',
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
        getFieldsToTrack: () => INSTRUCTION_FIELDS.map(f => f.name),
        onError: () => {
            showError('Fehler beim automatischen Speichern');
        }
    });

    useEffect(() => {
        if (!data || isInitialized.current) return;

        const formData = {
            customAntragPrompt: data.antragPrompt || '',
            customSocialPrompt: data.socialPrompt || '',
            customUniversalPrompt: data.universalPrompt || '',
            customRedePrompt: data.redePrompt || '',
            customBuergeranfragenPrompt: data.buergeranfragenPrompt || '',
            customGruenejugendPrompt: data.gruenejugendPrompt || '',
        };

        reset(formData);
        isInitialized.current = true;

        setTimeout(() => {
            setAutosaveEnabled(true);
            resetTracking();
        }, 100);
    }, [data, reset, resetTracking]);

    useEffect(() => {
        clearMessages();
    }, [isActive, clearMessages]);

    const handleAddField = useCallback((fieldName) => {
        setEnabledFields(prev => [...prev, fieldName]);
    }, []);

    const handleRemoveField = useCallback((fieldName) => {
        setValue(fieldName, '');
        setEnabledFields(prev => prev.filter(f => f !== fieldName));
    }, [setValue]);

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
            >
                <InstructionsGrid
                    control={control}
                    data={data}
                    isReadOnly={false}
                    labelPrefix="Persönliche"
                    enabledFields={enabledFields}
                    onAddField={handleAddField}
                    onRemoveField={handleRemoveField}
                />

                <div className="form-help-text">
                    Änderungen werden automatisch gespeichert
                </div>
            </div>
        </FormProvider>
    );
};

export default AnweisungenSection;
