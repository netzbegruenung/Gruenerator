import React from 'react';
import { motion } from "motion/react";
import { HiArrowLeft, HiInformationCircle } from 'react-icons/hi';

// Import the existing QA Creator component for reuse
import QACreator from '../../../../../../qa/components/QACreator';

// Common components
import { ProfileIconButton } from '../../../../../../../components/profile/actions/ProfileActionButton';

// Hooks
import { useQACollections } from '../../../../../hooks/useProfileData';
import { useBetaFeatures } from '../../../../../../../hooks/useBetaFeatures';

// Utils
import { handleError } from '../../../../../../../components/utils/errorHandling';

const NotebookCreator = ({ 
    onCompleted,
    onCancel,
    onSuccessMessage,
    onErrorMessage,
    availableDocuments
}) => {
    // Beta features check
    const { canAccessBetaFeature } = useBetaFeatures();
    const isQAEnabled = canAccessBetaFeature('qa');
    
    // Use centralized hooks
    const { 
        createQACollection,
        isCreating: isCreatingQA
    } = useQACollections({ isActive: isQAEnabled });

    // Handle save QA
    const handleSaveQA = async (qaData) => {
        try {
            await createQACollection(qaData);
            onSuccessMessage('Notebook erfolgreich erstellt.');
            onCompleted();
        } catch (error) {
            console.error('[NotebookCreator] Fehler beim Erstellen des Notebooks:', error);
            handleError(error, onErrorMessage);
        }
    };

    // Check if QA is enabled
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
                            Neues Notebook erstellen
                        </h3>
                    </div>
                    <div className="custom-generator-actions">
                        <ProfileIconButton
                            action="back"
                            onClick={onCancel}
                            ariaLabel="Zurück zur Übersicht"
                            title="Zurück"
                        />
                    </div>
                </div>

                <QACreator
                    onSave={handleSaveQA}
                    availableDocuments={availableDocuments}
                    editingCollection={null}
                    loading={isCreatingQA}
                    onCancel={onCancel}
                />
            </div>
        </motion.div>
    );
};

export default NotebookCreator;