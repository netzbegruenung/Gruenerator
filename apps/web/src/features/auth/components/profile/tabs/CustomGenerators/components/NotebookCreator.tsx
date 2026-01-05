import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { motion } from "motion/react";
import { HiInformationCircle, HiDocumentText } from 'react-icons/hi';
import EnhancedSelect from '../../../../../../../components/common/EnhancedSelect';
import { useFormFields } from '../../../../../../../components/common/Form/hooks';
import { ProfileIconButton } from '../../../../../../../components/profile/actions/ProfileActionButton';
import { useNotebookCollections } from '../../../../../hooks/useProfileData';
import { useBetaFeatures } from '../../../../../../../hooks/useBetaFeatures';
import { handleError, type ErrorState, type SetErrorFn } from '../../../../../../../components/utils/errorHandling';

// Adapter to convert string-based error handler to SetErrorFn
const createErrorAdapter = (onErrorMessage: (message: string) => void): SetErrorFn => {
    return (error: ErrorState | null): void => {
        if (error) {
            onErrorMessage(error.message || error.title || 'Ein Fehler ist aufgetreten');
        }
    };
};

import '../../../../../../notebook/styles/notebook-creator.css';
import '../../../../../../../assets/styles/components/ui/button.css';

interface AvailableDocument {
    id: string;
    title?: string;
    name?: string;
    filename?: string;
    file_size?: number;
    created_at?: string;
    status?: string;
    ocr_text?: string;
    [key: string]: unknown;
}

interface DocumentOption {
    value: string;
    label: string;
    iconType: string;
    subtitle: string;
    tag: { label: string; variant: string } | null;
    searchableContent: string;
    document: AvailableDocument;
    [key: string]: unknown;
}

interface NotebookFormData {
    name: string;
    description: string;
}

interface NotebookCreatorProps {
    onCompleted: (result: { id?: string; name?: string }) => void;
    onCancel: () => void;
    onSuccessMessage: (message: string) => void;
    onErrorMessage: (message: string) => void;
    availableDocuments?: AvailableDocument[];
}

const STEPS = {
    DOCUMENTS: 1,
    DETAILS: 2
} as const;

const formatFileSize = (bytes: number): string => {
    if (!bytes) return '';
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    if (bytes === 0) return '0 Bytes';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${Math.round(bytes / Math.pow(1024, i) * 10) / 10} ${sizes[i]}`;
};

const formatDate = (dateString: string | undefined): string => {
    if (!dateString) return '';
    try {
        return new Date(dateString).toLocaleDateString('de-DE', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
        });
    } catch {
        return '';
    }
};

const formatDocumentStatus = (status: string | undefined): string => {
    switch (status) {
        case 'completed':
            return 'Bereit';
        case 'processing':
            return 'Wird verarbeitet';
        case 'failed':
            return 'Fehler';
        case 'pending':
            return 'Warteschlange';
        default:
            return status || 'Unbekannt';
    }
};

const getDocumentIcon = (filename: string | undefined): string => {
    if (!filename) return 'document';
    const ext = filename.split('.').pop()?.toLowerCase();
    switch (ext) {
        case 'pdf':
        case 'doc':
        case 'docx':
            return 'document';
        case 'txt':
            return 'text';
        default:
            return 'document';
    }
};

const NotebookCreator = ({
    onCompleted,
    onCancel,
    onSuccessMessage,
    onErrorMessage,
    availableDocuments = []
}: NotebookCreatorProps): React.ReactElement => {
    const { canAccessBetaFeature } = useBetaFeatures();
    const isQAEnabled = canAccessBetaFeature('notebook');

    const {
        createQACollection,
        isCreating: isCreatingQA
    } = useNotebookCollections({ isActive: isQAEnabled });

    const [currentStep, setCurrentStep] = useState<number>(STEPS.DOCUMENTS);
    const [selectedDocuments, setSelectedDocuments] = useState<AvailableDocument[]>([]);

    const { Input, Textarea }: any = useFormFields();

    const {
        control,
        handleSubmit,
        clearErrors
    } = useForm({
        defaultValues: {
            name: '',
            description: ''
        },
        mode: 'onSubmit'
    });

    const handleNextStep = () => {
        if (currentStep === STEPS.DOCUMENTS && selectedDocuments.length > 0) {
            clearErrors();
            setCurrentStep(STEPS.DETAILS);
        }
    };

    const documentOptions: DocumentOption[] = availableDocuments.map(doc => {
        const subtitle: string[] = [];
        if (doc.filename) subtitle.push(doc.filename);
        if (doc.file_size) subtitle.push(formatFileSize(doc.file_size));
        if (doc.created_at) subtitle.push(`Hochgeladen: ${formatDate(doc.created_at)}`);

        return {
            value: doc.id,
            label: doc.title || doc.name || '',
            iconType: getDocumentIcon(doc.filename),
            subtitle: subtitle.join(' • '),
            tag: doc.status ? {
                label: formatDocumentStatus(doc.status),
                variant: 'custom'
            } : null,
            searchableContent: `${doc.title || doc.name || ''} ${doc.filename || ''} ${doc.ocr_text || ''}`.toLowerCase(),
            document: doc
        };
    });

    const handleDocumentSelectChange = (selectedOptions: readonly DocumentOption[] | null) => {
        const documents = selectedOptions ? selectedOptions.map(option => option.document) : [];
        setSelectedDocuments(documents);
    };

    const handleBack = () => {
        if (currentStep > STEPS.DOCUMENTS) {
            setCurrentStep(currentStep - 1);
        }
    };

    const handleSaveQA = async (formData: NotebookFormData) => {
        try {
            const qaData = {
                name: formData.name,
                description: formData.description,
                custom_prompt: '',
                selectionMode: 'documents',
                documents: selectedDocuments.map(doc => doc.id),
                wolkeShareLinks: [] as string[],
                auto_sync: false,
                remove_missing_on_sync: false
            };

            const createdCollection = await createQACollection(qaData);
            onSuccessMessage('Notebook erfolgreich erstellt.');
            onCompleted({ id: createdCollection.id, name: createdCollection.name });
        } catch (error) {
            console.error('[NotebookCreator] Fehler beim Erstellen des Notebooks:', error);
            handleError(error, createErrorAdapter(onErrorMessage));
        }
    };

    if (!isQAEnabled) {
        return (
            <div className="profile-content-card centered-content-card">
                <HiInformationCircle size={48} className="info-icon" />
                <h3>Feature nicht verfügbar</h3>
                <p>Notebooks sind derzeit nur für Beta-Tester verfügbar.</p>
                <button onClick={onCancel} className="profile-action-button profile-secondary-button">
                    Zurück zur Übersicht
                </button>
            </div>
        );
    }

    const renderDocumentsStep = () => (
        <div className="form-section">
            <div className="content-selection-header">
                <label className="form-label">
                    <HiDocumentText size={16} style={{ marginRight: '8px', verticalAlign: 'middle' }} />
                    Dokumente auswählen *
                </label>
            </div>

            <div className="documents-selection">
                {availableDocuments.length === 0 ? (
                    <div className="no-documents-message">
                        <p>Sie haben noch keine Dokumente hochgeladen.</p>
                        <p>Gehen Sie zum Tab "Meine Dokumente", um Dokumente hinzuzufügen.</p>
                    </div>
                ) : (
                    <>
                        <EnhancedSelect
                            className="react-select"
                            classNamePrefix="react-select"
                            enableIcons={true}
                            enableSubtitles={true}
                            enableTags={true}
                            isMulti
                            isSearchable
                            placeholder="Dokumente suchen und auswählen..."
                            options={documentOptions as any}
                            value={selectedDocuments.map(doc => {
                                const option = documentOptions.find(opt => opt.value === doc.id);
                                return (option || {
                                    value: doc.id,
                                    label: doc.title || '',
                                    iconType: 'document',
                                    subtitle: '',
                                    tag: null,
                                    searchableContent: doc.title || '',
                                    document: doc
                                }) as any;
                            })}
                            onChange={(newValue) => handleDocumentSelectChange(newValue as readonly DocumentOption[] | null)}
                            filterOption={() => true}
                            noOptionsMessage={() => 'Keine passenden Dokumente gefunden'}
                            closeMenuOnSelect={false}
                            hideSelectedOptions={false}
                            menuPortalTarget={document.body}
                            menuPosition="fixed"
                            maxMenuHeight={400}
                        />
                        {selectedDocuments.length > 0 && (
                            <div className="selected-content-summary">
                                {selectedDocuments.length} Dokument(e) ausgewählt
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );

    const renderDetailsStep = () => (
        <>
            <div className="form-section">
                <Input
                    name="name"
                    control={control}
                    label="Name des Notebooks"
                    placeholder="z.B. Klimapolitik-Dokumente"
                    rules={{
                        required: 'Name ist erforderlich',
                        maxLength: { value: 100, message: 'Name darf maximal 100 Zeichen haben' }
                    }}
                />
            </div>

            <div className="form-section">
                <Textarea
                    name="description"
                    control={control}
                    label="Beschreibung (optional)"
                    placeholder="Kurze Beschreibung des Notebooks..."
                    minRows={2}
                    maxRows={4}
                    rules={{
                        maxLength: { value: 500, message: 'Beschreibung darf maximal 500 Zeichen haben' }
                    }}
                />
            </div>
        </>
    );

    const renderCurrentStep = () => {
        switch (currentStep) {
            case STEPS.DOCUMENTS:
                return renderDocumentsStep();
            case STEPS.DETAILS:
                return renderDetailsStep();
            default:
                return null;
        }
    };

    const getStepTitle = () => {
        switch (currentStep) {
            case STEPS.DOCUMENTS:
                return 'Schritt 1: Dokumente auswählen';
            case STEPS.DETAILS:
                return 'Schritt 2: Notebook-Details';
            default:
                return 'Neues Notebook erstellen';
        }
    };

    return (
        <motion.div
            className="profile-content-card"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
        >
            <div className="profile-info-panel">
                <div className="profile-header-section">
                    <div className="group-title-area">
                        <h3 className="profile-user-name medium-profile-title">
                            {getStepTitle()}
                        </h3>
                    </div>
                    <div className="custom-generator-actions">
                        <ProfileIconButton
                            action="back"
                            onClick={currentStep > STEPS.DOCUMENTS ? handleBack : onCancel}
                            ariaLabel={currentStep > STEPS.DOCUMENTS ? "Zurück zum vorherigen Schritt" : "Zurück zur Übersicht"}
                            title="Zurück"
                        />
                    </div>
                </div>

                <div className="qa-creator-container">
                    <div className="qa-creator-card">
                        <form onSubmit={handleSubmit(handleSaveQA)} className="qa-creator-form">
                            <div className="qa-creator-content">
                                {renderCurrentStep()}
                            </div>

                            <div className="form-actions">
                                <button
                                    type="button"
                                    className="button submit-button"
                                    onClick={onCancel}
                                    disabled={isCreatingQA}
                                >
                                    Abbrechen
                                </button>
                                {currentStep === STEPS.DOCUMENTS ? (
                                    <button
                                        type="button"
                                        className="button submit-button"
                                        onClick={handleNextStep}
                                        disabled={selectedDocuments.length === 0}
                                    >
                                        Weiter
                                    </button>
                                ) : (
                                    <button
                                        type="submit"
                                        className={`button submit-button ${isCreatingQA ? 'submit-button--loading' : ''}`}
                                        disabled={isCreatingQA}
                                    >
                                        {isCreatingQA ? 'Wird gespeichert...' : 'Speichern'}
                                    </button>
                                )}
                            </div>
                        </form>
                    </div>
                </div>
            </div>
        </motion.div>
    );
};

export default NotebookCreator;
