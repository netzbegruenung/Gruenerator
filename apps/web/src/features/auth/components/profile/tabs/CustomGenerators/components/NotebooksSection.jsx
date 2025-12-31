import React, { useState, useEffect } from 'react';
import { motion } from "motion/react";
import { HiInformationCircle, HiPlus, HiTrash, HiPencil } from 'react-icons/hi';

// Common components
import Spinner from '../../../../../../../components/common/Spinner';
import HelpTooltip from '../../../../../../../components/common/HelpTooltip';
import { ProfileIconButton } from '../../../../../../../components/profile/actions/ProfileActionButton';

// Icons
import { NotebookIcon } from '../../../../../../../config/icons';

// Hooks
import { useNotebookCollections } from '../../../../../hooks/useProfileData';
import { useTabIndex } from '../../../../../../../hooks/useTabIndex';
import { useRovingTabindex } from '../../../../../../../hooks/useKeyboardNavigation';
import { useBetaFeatures } from '../../../../../../../hooks/useBetaFeatures';

// Utils
import { handleError } from '../../../../../../../components/utils/errorHandling';

const NotebooksSection = ({ 
    isActive,
    onSuccessMessage, 
    onErrorMessage,
    onNotebookSelect,
    notebookCollections,
    qaQuery
}) => {
    // Beta features check
    const { canAccessBetaFeature } = useBetaFeatures();
    const isQAEnabled = canAccessBetaFeature('notebook');
    
    // Tab index configuration
    const tabIndex = useTabIndex('PROFILE_NOTEBOOKS');
    
    // Use centralized hooks
    const { 
        deleteQACollection,
        isDeleting: isDeletingQA
    } = useNotebookCollections({ isActive: isActive && isQAEnabled });

    const qaError = qaQuery?.error;

    // Handle errors
    useEffect(() => {
        if (qaError) {
            console.error('[NotebooksSection] Fehler beim Laden der Notebooks:', qaError);
            handleError(qaError, onErrorMessage);
        }
    }, [qaError, onErrorMessage]);

    // Delete handler
    const handleDeleteQA = async (qaId) => {
        const qa = notebookCollections.find(q => q.id === qaId);
        if (!qa) return;
        
        if (!window.confirm(`Möchten Sie das Notebook "${qa.name}" wirklich löschen?`)) {
            return;
        }

        try {
            await deleteQACollection(qaId);
            onSuccessMessage('Notebook erfolgreich gelöscht.');
        } catch (error) {
            console.error('[NotebooksSection] Fehler beim Löschen des Notebooks:', error);
            handleError(error, onErrorMessage);
        }
    };

    // Navigation items for roving tabindex
    const navigationItems = [
        ...(notebookCollections ? notebookCollections.map(q => `qa-${q.id}`) : []),
        'create-new'
    ];
    
    // Roving tabindex for navigation
    const { getItemProps } = useRovingTabindex({
        items: navigationItems,
        defaultActiveItem: navigationItems.length > 1 ? navigationItems[0] : 'create-new'
    });

    // Check if QA is enabled
    if (!isQAEnabled) {
        return (
            <div className="profile-content-card centered-content-card">
                <HiInformationCircle size={48} className="info-icon" />
                <h3>Feature nicht verfügbar</h3>
                <p>Notebooks sind derzeit nur für Beta-Tester verfügbar.</p>
            </div>
        );
    }

    // Loading state
    if (qaQuery?.isLoading && !qaQuery?.data) {
        return (
            <div className="profile-content-card">
                <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}>
                    <Spinner size="medium" />
                </div>
            </div>
        );
    }

    // Error state
    if (qaError && (!notebookCollections || notebookCollections.length === 0)) {
        return (
            <div className="profile-content-card centered-content-card">
                <HiInformationCircle size={48} className="warning-icon" />
                <h3>Fehler beim Laden</h3>
                <p>Deine Notebooks konnten nicht geladen werden.</p>
                <p><i>{qaError.message || 'Bitte versuche es später erneut.'}</i></p>
                <button 
                    onClick={() => qaQuery?.refetch()}
                    className="profile-action-button profile-secondary-button"
                >
                    Erneut versuchen
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
                        <div className="header-with-help">
                            <h2 className="profile-user-name large-profile-title">Notebooks</h2>
                            <HelpTooltip>
                                <p>
                                    Notebooks sind intelligente Q&A-Systeme, die auf deinen Dokumenten basieren.
                                </p>
                                <p>
                                    <strong>Tipp:</strong> Erstelle themenspezifische Notebooks mit relevanten Dokumenten für effiziente Recherche.
                                </p>
                            </HelpTooltip>
                        </div>
                    </div>
                </div>

                <div className="group-overview-content">
                    {notebookCollections && notebookCollections.length > 0 ? (
                        <div className="notebooks-list">
                            <div 
                                className="profile-vertical-navigation notebooks-navigation"
                                role="list"
                                aria-label="Notebooks Liste"
                            >
                                {notebookCollections.map(qa => (
                                    <div 
                                        key={qa.id}
                                        className="notebook-item"
                                        role="listitem"
                                    >
                                        <button
                                            {...getItemProps(`qa-${qa.id}`)}
                                            className="profile-vertical-tab qa-tab"
                                            onClick={() => onNotebookSelect(qa.id)}
                                            aria-label={`Notebook ${qa.name}`}
                                        >
                                            <NotebookIcon className="qa-icon" />
                                            <div className="notebook-info">
                                                <span className="notebook-name">{qa.name}</span>
                                                {qa.description && (
                                                    <span className="notebook-description">{qa.description}</span>
                                                )}
                                                <div className="notebook-meta">
                                                    <span className="notebook-documents">
                                                        {qa.document_count || 0} Dokumente
                                                    </span>
                                                    {qa.created_at && (
                                                        <span className="notebook-created">
                                                            Erstellt: {new Date(qa.created_at).toLocaleDateString('de-DE')}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </button>
                                        <div className="notebook-actions">
                                            <ProfileIconButton
                                                action="delete"
                                                onClick={() => handleDeleteQA(qa.id)}
                                                disabled={isDeletingQA}
                                                title="Notebook löschen"
                                                ariaLabel={`Notebook ${qa.name} löschen`}
                                            />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ) : (
                        <section className="group-overview-section">
                            <h3>Erste Notebooks erstellen</h3>
                            <p>
                                Du hast noch keine Notebooks erstellt. 
                                Nutze den "Neu" Button links, um dein erstes Notebook zu erstellen!
                            </p>
                            <p>
                                Notebooks sind intelligente Q&A-Systeme, die auf deinen Dokumenten basieren. 
                                Du kannst sie verwenden, um effizient in deinen Inhalten zu recherchieren und 
                                präzise Antworten auf Fragen zu erhalten.
                            </p>
                        </section>
                    )}
                </div>
            </div>
        </motion.div>
    );
};

export default NotebooksSection;
