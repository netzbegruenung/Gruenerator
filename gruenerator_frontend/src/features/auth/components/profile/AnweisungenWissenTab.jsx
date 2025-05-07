import React, { useEffect } from 'react';
import { HiOutlineTrash } from 'react-icons/hi';
import Spinner from '../../../../components/common/Spinner';
import TextInput from '../../../../components/common/Form/Input/TextInput';
import { useProfileAnweisungenWissen } from '../../pages/useProfileAnweisungenWissen'; // Corrected path: one level up

const MAX_CONTENT_LENGTH = 1000; // Define locally or import from hook

const AnweisungenWissenTab = ({ user, templatesSupabase, onSuccessMessage, onErrorMessage }) => {

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
        isAntragPromptActive,
        isSocialPromptActive,
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
    } = useProfileAnweisungenWissen(); // Hook handles its own supabase client and user context

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

    return (
        <div className="profile-content">
           {/* Left Column: Avatar and Info */}
           <div className="profile-avatar-section">
              {/* Removed Avatar and User Info section */}
              <div className="anweisungen-info">
                <p>
                  Hier kannst du eigene Anweisungen und Wissensbausteine für den Grünerator hinterlegen.
                </p>
                <p>
                <strong>Tipp:</strong> Formuliere klare Anweisungen zum Stil oder persönliche Präferenzen.
                Nutze Wissen für wiederkehrende Infos (z.B. über dich, deinen Verband).
                </p>
              </div>
           </div>
           {/* Right Column: Forms and Status */}
           <div className="profile-form-section">
            <div className="auth-form">

              {/* Anweisungen Section */} 
              <div className="form-group">
                <div className="form-group-title">Benutzerdefinierte Anweisungen</div>

                {/* Loading/Error states handled by the hook, maybe show global spinner/error? */}
                {isLoadingQuery && <div style={{ padding: 'var(--spacing-large)', textAlign: 'center' }}><Spinner overlay={false} size="medium" /></div>}
                {isErrorQuery && <div className="auth-error-message" style={{ marginBottom: 'var(--spacing-medium)'}}>Fehler beim Laden: {errorQuery.message}</div>}

                {!isLoadingQuery && !isErrorQuery && (
                    <>
                        <div className="form-field-wrapper anweisungen-field">
                            <div className="anweisungen-header">
                                <label htmlFor="userCustomAntragPrompt">Anweisungen für Anträge:</label>
                                <div className="toggle-container">
                                <input
                                    type="checkbox"
                                    id="userAntragToggle"
                                    className="toggle-input"
                                    checked={isAntragPromptActive}
                                    onChange={(e) => handleAnweisungenChange('isAntragPromptActive', e.target.checked)}
                                    disabled={isSaving || isFetchingQuery}
                                />
                                <label htmlFor="userAntragToggle" className="toggle-label">
                                    <span className="toggle-text">{isAntragPromptActive ? 'Aktiv' : 'Inaktiv'}</span>
                                </label>
                                </div>
                            </div>
                            <textarea
                                id="userCustomAntragPrompt"
                                className="form-textarea anweisungen-textarea"
                                value={customAntragPrompt}
                                onChange={(e) => handleAnweisungenChange('customAntragPrompt', e.target.value)}
                                placeholder="Gib hier deine Anweisungen für die Erstellung von Anträgen ein..."
                                rows={8}
                                disabled={isSaving || isFetchingQuery}
                            />
                            <p className="help-text">
                                Diese Anweisungen werden bei der Erstellung von Anträgen berücksichtigt, wenn der Toggle aktiviert ist.
                            </p>
                        </div>

                        {/* Anweisungen für Social Media */} 
                        <div className="form-field-wrapper anweisungen-field">
                            <div className="anweisungen-header">
                                <label htmlFor="userCustomSocialPrompt">Anweisungen für Social Media & Presse:</label>
                                <div className="toggle-container">
                                <input
                                    type="checkbox"
                                    id="userSocialToggle"
                                    className="toggle-input"
                                    checked={isSocialPromptActive}
                                    onChange={(e) => handleAnweisungenChange('isSocialPromptActive', e.target.checked)}
                                    disabled={isSaving || isFetchingQuery}
                                />
                                <label htmlFor="userSocialToggle" className="toggle-label">
                                    <span className="toggle-text">{isSocialPromptActive ? 'Aktiv' : 'Inaktiv'}</span>
                                </label>
                                </div>
                            </div>
                            <textarea
                                id="userCustomSocialPrompt"
                                className="form-textarea anweisungen-textarea"
                                value={customSocialPrompt}
                                onChange={(e) => handleAnweisungenChange('customSocialPrompt', e.target.value)}
                                placeholder="Gib hier deine Anweisungen für die Erstellung von Social Media Inhalten ein..."
                                rows={8}
                                disabled={isSaving || isFetchingQuery}
                            />
                            <p className="help-text">
                                Diese Anweisungen werden bei der Erstellung von Social Media & Presse-Inhalten berücksichtigt, wenn der Toggle aktiviert ist.
                            </p>
                        </div>
                    </>
                )}
              </div>

              <hr style={{ margin: 'var(--spacing-xlarge) 0' }} />

              {/* Wissen Section */} 
              <div className="form-group knowledge-management-section">
                <div className="form-group-title">Persönliches Wissen</div>
                <p className="help-text" style={{ marginBottom: 'var(--spacing-medium)' }}>
                  Hinterlege hier bis zu drei Wissensbausteine.
                </p>

                {/* Loading/Error handled above */} 
                {!isLoadingQuery && !isErrorQuery && (
                   knowledgeEntries.map((entry, index) => (
                     <div key={entry.id} className="knowledge-entry" style={{ marginBottom: 'var(--spacing-large)', borderTop: index > 0 ? '1px solid var(--border-subtle)' : 'none', paddingTop: index > 0 ? 'var(--spacing-large)' : '0' }}>
                       <div className="form-field-wrapper anweisungen-field">
                         <div className="anweisungen-header">
                           <label htmlFor={`user-knowledge-title-${entry.id}`}>Wissen #{index + 1}: Titel</label>
                           {!(entry.isNew || (typeof entry.id === 'string' && entry.id.startsWith('new-'))) && (
                             <button
                               type="button"
                               onClick={() => handleDeleteKnowledge(entry.id)} // Use wrapper
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
                         <label htmlFor={`user-knowledge-content-${entry.id}`} style={{ marginTop: 'var(--spacing-small)', display: 'block' }}>Inhalt:</label>
                         <textarea
                           id={`user-knowledge-content-${entry.id}`}
                           className="form-textarea anweisungen-textarea"
                           value={entry.content}
                           onChange={(e) => handleKnowledgeChange(entry.id, 'content', e.target.value)}
                           placeholder="Füge hier den Wissensinhalt ein..."
                           rows={6}
                           maxLength={MAX_CONTENT_LENGTH}
                           disabled={isSaving || isDeletingKnowledge}
                         />
                         <p className="help-text character-count" style={{ textAlign: 'right', fontSize: '0.8em', marginTop: 'var(--spacing-xxsmall)' }}>
                           {entry.content?.length || 0} / {MAX_CONTENT_LENGTH} Zeichen
                         </p>
                       </div>
                     </div>
                   ))
                )}
                {/* Delete error message handled by parent */} 
              </div>

              {/* Save Button Area */} 
              {!isLoadingQuery && !isErrorQuery && (
                <div className="profile-actions anweisungen-actions" style={{ marginTop: 'var(--spacing-large)', display: 'flex', alignItems: 'center', gap: 'var(--spacing-medium)' }}>
                    <button
                        type="button"
                        className="profile-action-button profile-primary-button"
                        onClick={handleSaveChanges} // Use wrapper
                        disabled={!hasUnsavedChanges || isSaving || isFetchingQuery || isDeletingKnowledge}
                        aria-live="polite"
                    >
                        {isSaving ? <Spinner size="small" /> : 'Änderungen speichern'}
                    </button>
                </div>
              )}

            </div>
           </div>
        </div>
    );
};

export default AnweisungenWissenTab; 