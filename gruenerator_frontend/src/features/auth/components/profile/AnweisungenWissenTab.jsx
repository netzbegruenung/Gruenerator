import React, { useEffect, useRef, useState } from 'react';
import { HiOutlineTrash } from 'react-icons/hi';
import Spinner from '../../../../components/common/Spinner';
import TextInput from '../../../../components/common/Form/Input/TextInput';
import { useProfileAnweisungenWissen } from '../../pages/useProfileAnweisungenWissen'; // Corrected path: one level up
import { autoResizeTextarea } from '../../pages/ProfilePage';
import ProfileTabSkeleton from '../../../../components/common/UI/ProfileTabSkeleton';
import { motion } from "motion/react";

const MAX_CONTENT_LENGTH = 1000; // Define locally or import from hook

const AnweisungenWissenTab = ({ user, templatesSupabase, onSuccessMessage, onErrorMessage, isActive }) => {
    // Refs für die Textareas
    const antragTextareaRef = useRef(null);
    const socialTextareaRef = useRef(null);
    const knowledgeTextareaRefs = useRef({});

    const [currentView, setCurrentView] = useState('anweisungen'); // 'anweisungen' or 'wissen'

    // Fetch display name parts for avatar (assuming they are not passed directly)
    // This might require an additional small fetch or passing props
    // const email = user?.email || '';
    // These might be stale if ProfileInfoTab updated them and page didn't rerender fully
    // const firstName = user?.user_metadata?.first_name || ''; 
    // const lastName = user?.user_metadata?.last_name || ''; 
    // const displayName = user?.user_metadata?.display_name || email;

    const {
        customAntragPrompt,
        customSocialPrompt,
        knowledgeEntries,
        handleAnweisungenChange,
        handleKnowledgeChange,
        handleKnowledgeDelete,
        saveChanges,
        isSaving,
        isSaveSuccess,
        isSaveError,
        saveError,
        isDeletingKnowledge,
        deletingKnowledgeId,
        isDeleteKnowledgeError,
        deleteKnowledgeError,
        isLoadingQuery,
        isFetchingQuery,
        isErrorQuery,
        errorQuery,
        hasUnsavedChanges,
        // MAX_CONTENT_LENGTH // Use local definition or the one from the hook
    } = useProfileAnweisungenWissen({ isActive }); // Pass isActive to the hook

    // Effect to handle feedback messages using parent callbacks
    useEffect(() => {
        let timer;
        if (isSaveSuccess) {
            onSuccessMessage('Anweisungen/Wissen erfolgreich gespeichert!');
            timer = setTimeout(() => onSuccessMessage(''), 3000);
        } else if (isSaveError) {
            const message = saveError instanceof Error ? saveError.message : 'Ein unbekannter Fehler ist aufgetreten.';
            onErrorMessage(`Fehler beim Speichern (Anweisungen/Wissen): ${message}`);
            timer = setTimeout(() => onErrorMessage(''), 6000);
        } else if (isDeleteKnowledgeError) {
            const message = deleteKnowledgeError instanceof Error ? deleteKnowledgeError.message : 'Ein unbekannter Fehler ist aufgetreten.';
            onErrorMessage(`Fehler beim Löschen (Wissen): ${message}`);
            timer = setTimeout(() => onErrorMessage(''), 6000);
        }
        return () => clearTimeout(timer);
      }, [isSaveSuccess, isSaveError, saveError, isDeleteKnowledgeError, deleteKnowledgeError, onSuccessMessage, onErrorMessage]);

    // Clear messages before initiating save or delete
    const handleSaveChanges = () => {
        onSuccessMessage('');
        onErrorMessage('');
        saveChanges();
    };

    const handleDeleteKnowledge = (entryId) => {
        onSuccessMessage('');
        onErrorMessage('');
        handleKnowledgeDelete(entryId);
    };

    // Effekt zur Anwendung der autoResize-Funktion
    useEffect(() => {
        if (antragTextareaRef.current) {
            autoResizeTextarea(antragTextareaRef.current);
        }
        if (socialTextareaRef.current) {
            autoResizeTextarea(socialTextareaRef.current);
        }
        
        // Für alle Wissens-Textareas
        Object.values(knowledgeTextareaRefs.current).forEach(ref => {
            if (ref) autoResizeTextarea(ref);
        });
    }, [customAntragPrompt, customSocialPrompt, knowledgeEntries]);

    const handleTabClick = (view) => {
        onSuccessMessage(''); // Clear messages on tab switch
        onErrorMessage('');
        setCurrentView(view);
    };

    const renderNavigationPanel = () => (
        <div className="groups-vertical-navigation">
            <button
                className={`groups-vertical-tab ${currentView === 'anweisungen' ? 'active' : ''}`}
                onClick={() => handleTabClick('anweisungen')}
            >
                Anweisungen
            </button>
            <button
                className={`groups-vertical-tab ${currentView === 'wissen' ? 'active' : ''}`}
                onClick={() => handleTabClick('wissen')}
            >
                Wissen
            </button>
        </div>
    );

    return (
        <>
            {isLoadingQuery && (
                <ProfileTabSkeleton type={currentView === 'anweisungen' ? 'form' : 'list'} itemCount={3} />
            )}
            {isErrorQuery && <div className="auth-error-message error-message-container" style={{ margin: 'var(--spacing-large)' }}>Fehler beim Laden der Anweisungen & Wissensdaten: {errorQuery.message}</div>}

            {!isLoadingQuery && !isErrorQuery && (
                <motion.div 
                    className="profile-content groups-management-layout"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.3 }}
                >
                    <div className="groups-navigation-panel">
                        {renderNavigationPanel()}
                    </div>
                    <div className="groups-content-panel profile-form-section">
                        <div className="group-content-card">
                            <div className="auth-form">
                                <div className="anweisungen-info" style={{ marginBottom: 'var(--spacing-large)', paddingBottom: 'var(--spacing-medium)', borderBottom: '1px solid var(--border-subtle)' }}>
                                    <p>
                                      Hier kannst du eigene Anweisungen und Wissensbausteine für den Grünerator hinterlegen.
                                    </p>
                                    <p>
                                    <strong>Tipp:</strong> Formuliere klare Anweisungen zum Stil oder persönliche Präferenzen.
                                    Nutze Wissen für wiederkehrende Infos (z.B. über dich, deinen Verband).
                                    </p>
                                </div>

                                {currentView === 'anweisungen' && (
                                    <div className="form-group">
                                        <div className="form-group-title">Benutzerdefinierte Anweisungen</div>
                                        <div className="form-field-wrapper anweisungen-field">
                                            <div className="anweisungen-header">
                                                <label htmlFor="userCustomAntragPrompt">Anweisungen für Anträge:</label>
                                            </div>
                                            <textarea
                                                id="userCustomAntragPrompt"
                                                className="form-textarea anweisungen-textarea auto-expand-textarea"
                                                value={customAntragPrompt}
                                                onChange={(e) => {
                                                    handleAnweisungenChange('customAntragPrompt', e.target.value);
                                                    autoResizeTextarea(e.target);
                                                }}
                                                placeholder="Gib hier deine Anweisungen für die Erstellung von Anträgen ein..."
                                                rows={4}
                                                disabled={isSaving || isFetchingQuery}
                                                ref={antragTextareaRef}
                                            />
                                            <p className="help-text">
                                                Diese Anweisungen werden bei der Erstellung von Anträgen berücksichtigt.
                                            </p>
                                        </div>

                                        <div className="form-field-wrapper anweisungen-field">
                                            <div className="anweisungen-header">
                                                <label htmlFor="userCustomSocialPrompt">Anweisungen für Social Media & Presse:</label>
                                            </div>
                                            <textarea
                                                id="userCustomSocialPrompt"
                                                className="form-textarea anweisungen-textarea auto-expand-textarea"
                                                value={customSocialPrompt}
                                                onChange={(e) => {
                                                    handleAnweisungenChange('customSocialPrompt', e.target.value);
                                                    autoResizeTextarea(e.target);
                                                }}
                                                placeholder="Gib hier deine Anweisungen für die Erstellung von Social Media Inhalten ein..."
                                                rows={4}
                                                disabled={isSaving || isFetchingQuery}
                                                ref={socialTextareaRef}
                                            />
                                            <p className="help-text">
                                                Diese Anweisungen werden bei der Erstellung von Social Media & Presse-Inhalten berücksichtigt.
                                            </p>
                                        </div>
                                    </div>
                                )}

                                {currentView === 'wissen' && (
                                    <div className="form-group knowledge-management-section">
                                        <div className="form-group-title">Persönliches Wissen</div>
                                        {knowledgeEntries.map((entry, index) => (
                                            <div key={entry.id} className={`knowledge-entry ${index > 0 ? 'knowledge-entry-bordered' : ''}`}>
                                                <div className="form-field-wrapper anweisungen-field">
                                                    <div className="anweisungen-header">
                                                        <label htmlFor={`user-knowledge-title-${entry.id}`}>Wissen #{index + 1}: Titel</label>
                                                        {!(entry.isNew || (typeof entry.id === 'string' && entry.id.startsWith('new-'))) && (
                                                            <button
                                                                type="button"
                                                                onClick={() => handleDeleteKnowledge(entry.id)}
                                                                className="knowledge-delete-button icon-button danger"
                                                                disabled={isSaving || (isDeletingKnowledge && deletingKnowledgeId === entry.id)}
                                                                aria-label={`Wissenseintrag ${index + 1} löschen`}
                                                            >
                                                                {(isDeletingKnowledge && deletingKnowledgeId === entry.id) ? <Spinner size="xsmall" /> : <HiOutlineTrash />}
                                                            </button>
                                                        )}
                                                    </div>
                                                    <TextInput
                                                        id={`user-knowledge-title-${entry.id}`}
                                                        type="text"
                                                        value={entry.title}
                                                        onChange={(e) => handleKnowledgeChange(entry.id, 'title', e.target.value)}
                                                        placeholder="Kurzer, prägnanter Titel (z.B. 'OV Musterstadt Vorstand')"
                                                        maxLength={100}
                                                        disabled={isSaving || isDeletingKnowledge}
                                                        className="form-input"
                                                    />
                                                </div>
                                                <div className="form-field-wrapper anweisungen-field">
                                                    <label htmlFor={`user-knowledge-content-${entry.id}`} className="knowledge-content-label">Inhalt:</label>
                                                    <textarea
                                                        id={`user-knowledge-content-${entry.id}`}
                                                        className="form-textarea anweisungen-textarea auto-expand-textarea"
                                                        value={entry.content}
                                                        onChange={(e) => {
                                                            handleKnowledgeChange(entry.id, 'content', e.target.value);
                                                            autoResizeTextarea(e.target);
                                                        }}
                                                        placeholder="Füge hier den Wissensinhalt ein..."
                                                        rows={3}
                                                        maxLength={MAX_CONTENT_LENGTH}
                                                        disabled={isSaving || isDeletingKnowledge}
                                                        ref={(el) => knowledgeTextareaRefs.current[entry.id] = el}
                                                    />
                                                    <p className="help-text character-count">
                                                        {entry.content?.length || 0} / {MAX_CONTENT_LENGTH} Zeichen
                                                    </p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                                
                                {/* Save Button Area - Common for both views */}
                                <div className="profile-actions profile-actions-container" style={{ marginTop: 'var(--spacing-large)' }}>
                                    <button
                                        type="button"
                                        className="profile-action-button profile-primary-button"
                                        onClick={handleSaveChanges}
                                        disabled={!hasUnsavedChanges || isSaving || isDeletingKnowledge}
                                        aria-live="polite"
                                    >
                                        {isSaving ? <Spinner size="small" /> : 'Änderungen speichern'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </motion.div>
            )}
        </>
    );
};

export default AnweisungenWissenTab; 