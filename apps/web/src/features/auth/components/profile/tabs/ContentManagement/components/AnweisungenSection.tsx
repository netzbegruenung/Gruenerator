import { useEffect, useState, useCallback, useRef } from 'react';
import { useForm, FormProvider, Control } from 'react-hook-form';
import { useAutosave } from '../../../../../../../hooks/useAutosave';
import { useMessageHandling } from '../../../../../../../hooks/useMessageHandling';
import { useAnweisungenWissen } from '../../../../../hooks/useProfileData';
import { InstructionsGrid, INSTRUCTION_FIELDS } from '../../../../../../../components/common/InstructionFields';

interface AnweisungenSectionProps {
    isActive: boolean;
    onSuccessMessage: (message: string) => void;
    onErrorMessage: (message: string) => void;
}

interface AnweisungenFormData {
    customAntragPrompt: string;
    customSocialPrompt: string;
    customUniversalPrompt: string;
    customRedePrompt: string;
    customBuergeranfragenPrompt: string;
    customGruenejugendPrompt: string;
    knowledge?: unknown[];
    [key: string]: string | unknown[] | undefined;
}

interface AnweisungenData {
    antragPrompt?: string;
    socialPrompt?: string;
    universalPrompt?: string;
    redePrompt?: string;
    buergeranfragenPrompt?: string;
    gruenejugendPrompt?: string;
    knowledge?: unknown[];
    [key: string]: string | unknown[] | undefined;
}

const AnweisungenSection = ({
    isActive,
    onSuccessMessage,
    onErrorMessage
}: AnweisungenSectionProps) => {
    const isInitialized = useRef(false);
    const [enabledFields, setEnabledFields] = useState<string[]>([]);

    const { clearMessages, showSuccess, showError } = useMessageHandling(onSuccessMessage, onErrorMessage);

    const anweisungenResult = useAnweisungenWissen({ enabled: isActive });
    const { query, isSaving } = anweisungenResult;
    const saveChanges = anweisungenResult.saveChanges as (data: unknown) => Promise<void>;
    const { data, isError: isErrorQuery, error: errorQuery } = query;
    const typedData = data as AnweisungenData | undefined;

    const defaultValues: AnweisungenFormData = {
        customAntragPrompt: '',
        customSocialPrompt: '',
        customUniversalPrompt: '',
        customRedePrompt: '',
        customBuergeranfragenPrompt: '',
        customGruenejugendPrompt: '',
        knowledge: []
    };

    const formMethods = useForm<AnweisungenFormData>({
        defaultValues,
        mode: 'onChange'
    });

    const { control, getValues, reset, watch, setValue } = formMethods;

    const [autosaveEnabled, setAutosaveEnabled] = useState(false);

    const { resetTracking } = useAutosave({
        saveFunction: useCallback(async (changedFields: Record<string, unknown>) => {
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
                await saveChanges(formData);
                showSuccess('Änderungen wurden automatisch gespeichert');
            } catch (error) {
                showError('Fehler beim automatischen Speichern: ' + (error instanceof Error ? error.message : 'Unbekannter Fehler'));
                throw error;
            }
        }, [saveChanges, getValues, showSuccess, showError]),
        formRef: { getValues: getValues as () => Record<string, unknown>, watch },
        enabled: autosaveEnabled,
        debounceMs: 2000,
        getFieldsToTrack: () => INSTRUCTION_FIELDS.map(f => f.name),
        onError: () => {
            showError('Fehler beim automatischen Speichern');
        }
    });

    useEffect(() => {
        if (!typedData || isInitialized.current) return;

        const formData: Partial<AnweisungenFormData> = {
            customAntragPrompt: typedData.antragPrompt || '',
            customSocialPrompt: typedData.socialPrompt || '',
            customUniversalPrompt: typedData.universalPrompt || '',
            customRedePrompt: typedData.redePrompt || '',
            customBuergeranfragenPrompt: typedData.buergeranfragenPrompt || '',
            customGruenejugendPrompt: typedData.gruenejugendPrompt || '',
        };

        reset(formData as AnweisungenFormData);
        isInitialized.current = true;

        setTimeout(() => {
            setAutosaveEnabled(true);
            resetTracking();
        }, 100);
    }, [typedData, reset, resetTracking]);

    useEffect(() => {
        clearMessages();
    }, [isActive, clearMessages]);

    const handleAddField = useCallback((fieldName: string) => {
        setEnabledFields(prev => [...prev, fieldName]);
    }, []);

    const handleRemoveField = useCallback((fieldName: string) => {
        type FormFieldName = 'customAntragPrompt' | 'customSocialPrompt' | 'customUniversalPrompt' | 'customRedePrompt' | 'customBuergeranfragenPrompt' | 'customGruenejugendPrompt';
        setValue(fieldName as FormFieldName, '');
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
                    control={control as unknown as Control<Record<string, unknown>>}
                    data={typedData as Record<string, unknown> | undefined}
                    isReadOnly={false}
                    labelPrefix="Persönliche"
                    maxLength={2000}
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
