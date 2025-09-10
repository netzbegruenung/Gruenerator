import React, { useState, useEffect } from 'react';
import { motion } from "motion/react";
import { HiInformationCircle, HiPlus, HiTrash, HiCog } from 'react-icons/hi';

// Common components
import Spinner from '../../../../../../../components/common/Spinner';
import HelpTooltip from '../../../../../../../components/common/HelpTooltip';
import { ProfileIconButton } from '../../../../../../../components/profile/actions/ProfileActionButton';

// Hooks
import { useTabIndex } from '../../../../../../../hooks/useTabIndex';
import { useRovingTabindex } from '../../../../../../../hooks/useKeyboardNavigation';

// Utils
import { handleError } from '../../../../../../../components/utils/errorHandling';

const GeneratorsSection = ({ 
    isActive,
    onSuccessMessage, 
    onErrorMessage,
    onGeneratorSelect,
    generators,
    query,
    deleteGenerator,
    isDeleting,
    deleteError
}) => {
    // Tab index configuration
    const tabIndex = useTabIndex('PROFILE_GENERATORS');
    
    // Fetch error from parent query
    const fetchError = query?.error;

    // Handle errors
    useEffect(() => {
        if (fetchError) {
            console.error('[GeneratorsSection] Fehler beim Laden der Grüneratoren:', fetchError);
            handleError(fetchError, onErrorMessage);
        }
        if (deleteError) {
            handleError(deleteError, onErrorMessage);
        }
    }, [fetchError, deleteError, onErrorMessage]);

    // Delete handler
    const handleDeleteGenerator = async (generatorId) => {
        if (!window.confirm('Möchten Sie diesen Grünerator wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.')) {
            return;
        }

        onErrorMessage('');
        onSuccessMessage('');

        try {
            await deleteGenerator(generatorId);
            onSuccessMessage('Grünerator erfolgreich gelöscht.');
        } catch (err) {
            // Error already handled by useCustomGenerators hook
        }
    };

    // Navigation items for roving tabindex
    const navigationItems = [
        ...(generators ? generators.map(g => `generator-${g.id}`) : []),
        'create-new'
    ];
    
    // Roving tabindex for navigation
    const { getItemProps } = useRovingTabindex({
        items: navigationItems,
        defaultActiveItem: navigationItems.length > 1 ? navigationItems[0] : 'create-new'
    });

    // Loading state
    if (query?.isLoading && !query?.data) {
        return (
            <div className="profile-content-card">
                <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}>
                    <Spinner size="medium" />
                </div>
            </div>
        );
    }

    // Error state
    if (fetchError && (!generators || generators.length === 0)) {
        return (
            <div className="profile-content-card centered-content-card">
                <HiInformationCircle size={48} className="warning-icon" />
                <h3>Fehler beim Laden</h3>
                <p>Deine Custom Grüneratoren konnten nicht geladen werden.</p>
                <p><i>{fetchError.message || 'Bitte versuche es später erneut.'}</i></p>
                <button 
                    onClick={() => query?.refetch()}
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
                            <h2 className="profile-user-name large-profile-title">Custom Grüneratoren</h2>
                            <HelpTooltip>
                                <p>
                                    Hier kannst du eigene Custom Grüneratoren erstellen und verwalten.
                                </p>
                                <p>
                                    <strong>Tipp:</strong> Erstelle spezialisierte Custom Grüneratoren für wiederkehrende Aufgaben in deinem Bereich.
                                </p>
                            </HelpTooltip>
                        </div>
                    </div>
                </div>

                <div className="group-overview-content">
                    {generators && generators.length > 0 ? (
                        <div className="generators-list">
                            <div 
                                className="profile-vertical-navigation generators-navigation"
                                role="list"
                                aria-label="Custom Grüneratoren Liste"
                            >
                                {generators.map(generator => (
                                    <div 
                                        key={generator.id}
                                        className="generator-item"
                                        role="listitem"
                                    >
                                        <button
                                            {...getItemProps(`generator-${generator.id}`)}
                                            className="profile-vertical-tab generator-tab"
                                            onClick={() => onGeneratorSelect(generator.id)}
                                            aria-label={`Custom Grünerator ${generator.title || generator.name}`}
                                        >
                                            <HiCog className="generator-icon" />
                                            <div className="generator-info">
                                                <span className="generator-name">{generator.title || generator.name}</span>
                                                {generator.description && (
                                                    <span className="generator-description">{generator.description}</span>
                                                )}
                                            </div>
                                        </button>
                                        <div className="generator-actions">
                                            {/* Removed external open arrow to keep UX focused inside tab */}
                                            <ProfileIconButton
                                                action="delete"
                                                onClick={() => handleDeleteGenerator(generator.id)}
                                                disabled={isDeleting}
                                                title="Löschen"
                                                ariaLabel={`Custom Grünerator ${generator.title || generator.name} löschen`}
                                            />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ) : (
                        <section className="group-overview-section">
                            <h3>Erste Custom Grüneratoren erstellen</h3>
                            <p>
                                Du hast noch keine eigenen Custom Grüneratoren erstellt. 
                                Nutze den "Neu" Button links, um deinen ersten Custom Grünerator zu erstellen!
                            </p>
                            <p>
                                Custom Grüneratoren ermöglichen es dir, spezialisierte Text-Generatoren für wiederkehrende 
                                Aufgaben zu erstellen und sie mit anderen zu teilen.
                            </p>
                        </section>
                    )}
                </div>
            </div>
        </motion.div>
    );
};

export default GeneratorsSection;
