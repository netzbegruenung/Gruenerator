import React, { useState, useEffect } from 'react';
import { HiOutlineTrash } from 'react-icons/hi';
import TextInput from '../../../components/common/Form/Input/TextInput';
import Spinner from '../../../components/common/Spinner';
import useGroupDetails from '../hooks/useGroupDetails';

const GroupDetailView = ({ groupId, onBack }) => {
  const {
    // Group info
    groupInfo,
    joinToken,
    isAdmin,
    
    // Instructions
    customAntragPrompt,
    customSocialPrompt,
    isAntragPromptActive,
    isSocialPromptActive,
    handleInstructionsChange,
    
    // Knowledge
    knowledgeEntries,
    handleKnowledgeChange,
    handleKnowledgeDelete,
    
    // Status
    isLoadingDetails,
    isErrorDetails,
    errorDetails,
    
    // Actions
    saveChanges,
    isSaving,
    isSaveSuccess,
    isSaveError,
    saveError,
    
    // Knowledge deletion
    isDeletingKnowledge,
    
    // Other
    hasUnsavedChanges,
    MAX_CONTENT_LENGTH
  } = useGroupDetails(groupId);

  const [showJoinLink, setShowJoinLink] = useState(false);
  const [joinLinkCopied, setJoinLinkCopied] = useState(false);
  const [saveFeedbackMessage, setSaveFeedbackMessage] = useState('');
  const [saveFeedbackType, setSaveFeedbackType] = useState('success');

  // Create full join URL
  const getJoinUrl = () => {
    const baseUrl = window.location.origin;
    return `${baseUrl}/join-group/${joinToken}`;
  };

  // Copy join link to clipboard
  const copyJoinLink = () => {
    navigator.clipboard.writeText(getJoinUrl())
      .then(() => {
        setJoinLinkCopied(true);
        setTimeout(() => setJoinLinkCopied(false), 3000);
      })
      .catch(err => {
        console.error('Failed to copy link:', err);
      });
  };

  // Set feedback messages after save attempt
  useEffect(() => {
    let timer;
    
    if (isSaveSuccess) {
      setSaveFeedbackMessage('Änderungen erfolgreich gespeichert!');
      setSaveFeedbackType('success');
      timer = setTimeout(() => setSaveFeedbackMessage(''), 3000);
    } else if (isSaveError) {
      const message = saveError instanceof Error ? saveError.message : 'Ein unbekannter Fehler ist aufgetreten.';
      setSaveFeedbackMessage(`Fehler beim Speichern: ${message}`);
      setSaveFeedbackType('error');
      timer = setTimeout(() => setSaveFeedbackMessage(''), 6000);
    }
    
    return () => clearTimeout(timer);
  }, [isSaveSuccess, isSaveError, saveError]);

  if (isLoadingDetails) {
    return (
      <div className="group-detail-container">
        <div className="loading-container">
          <Spinner size="medium" />
        </div>
      </div>
    );
  }

  if (isErrorDetails) {
    return (
      <div className="group-detail-container">
        <div className="error-container">
          <h2>Fehler beim Laden der Gruppe</h2>
          <p>{errorDetails.message}</p>
          <button onClick={onBack} className="button secondary">Zurück zur Gruppenliste</button>
        </div>
      </div>
    );
  }

  if (!groupInfo) {
    return (
      <div className="group-detail-container">
        <div className="error-container">
          <h2>Gruppe nicht gefunden</h2>
          <button onClick={onBack} className="button secondary">Zurück zur Gruppenliste</button>
        </div>
      </div>
    );
  }

  return (
    <div className="group-detail-container">
      <div className="group-detail-header">
        <button onClick={onBack} className="back-button" type="button">
          ← Zurück zur Gruppenliste
        </button>
        <h2>{groupInfo.name}</h2>
        <div className="group-role-badge">
          {isAdmin ? 'Admin' : 'Mitglied'}
        </div>
      </div>

      {isAdmin && (
        <div className="group-admin-section">
          <div className="join-link-section">
            <h3>Einladungslink</h3>
            <p>Teile diesen Link, um andere zu dieser Gruppe einzuladen:</p>
            
            <div className="join-link-container">
              {showJoinLink ? (
                <>
                  <input
                    type="text"
                    className="join-link-input"
                    value={getJoinUrl()}
                    readOnly
                  />
                  <button
                    onClick={copyJoinLink}
                    className="button primary"
                    type="button"
                  >
                    {joinLinkCopied ? 'Kopiert!' : 'Kopieren'}
                  </button>
                  <button
                    onClick={() => setShowJoinLink(false)}
                    className="button secondary"
                    type="button"
                  >
                    Verbergen
                  </button>
                </>
              ) : (
                <button
                  onClick={() => setShowJoinLink(true)}
                  className="button secondary"
                  type="button"
                >
                  Einladungslink anzeigen
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Anweisungen Section */}
      <div className="group-content-section">
        <h3>Gruppenanweisungen</h3>
        <p className="help-text">
          Diese Anweisungen werden bei der Generierung für alle Gruppenmitglieder berücksichtigt.
        </p>
        
        <div className="form-group">
          <div className="form-field-wrapper">
            <div className="anweisungen-header">
              <label htmlFor="customAntragPrompt">Anweisungen für Anträge:</label>
              <div className="toggle-container">
                <input
                  type="checkbox"
                  id="antragToggle"
                  className="toggle-input"
                  checked={isAntragPromptActive}
                  onChange={(e) => handleInstructionsChange('isAntragPromptActive', e.target.checked)}
                  disabled={!isAdmin || isSaving}
                />
                <label htmlFor="antragToggle" className="toggle-label">
                  <span className="toggle-text">{isAntragPromptActive ? 'Aktiv' : 'Inaktiv'}</span>
                </label>
              </div>
            </div>
            <textarea
              id="customAntragPrompt"
              className="form-textarea anweisungen-textarea"
              value={customAntragPrompt}
              onChange={(e) => handleInstructionsChange('customAntragPrompt', e.target.value)}
              placeholder="Gib hier Anweisungen für die Erstellung von Anträgen ein..."
              rows={6}
              disabled={!isAdmin || isSaving}
            />
          </div>

          <div className="form-field-wrapper">
            <div className="anweisungen-header">
              <label htmlFor="customSocialPrompt">Anweisungen für Social Media & Presse:</label>
              <div className="toggle-container">
                <input
                  type="checkbox"
                  id="socialToggle"
                  className="toggle-input"
                  checked={isSocialPromptActive}
                  onChange={(e) => handleInstructionsChange('isSocialPromptActive', e.target.checked)}
                  disabled={!isAdmin || isSaving}
                />
                <label htmlFor="socialToggle" className="toggle-label">
                  <span className="toggle-text">{isSocialPromptActive ? 'Aktiv' : 'Inaktiv'}</span>
                </label>
              </div>
            </div>
            <textarea
              id="customSocialPrompt"
              className="form-textarea anweisungen-textarea"
              value={customSocialPrompt}
              onChange={(e) => handleInstructionsChange('customSocialPrompt', e.target.value)}
              placeholder="Gib hier Anweisungen für die Erstellung von Social Media Inhalten ein..."
              rows={6}
              disabled={!isAdmin || isSaving}
            />
          </div>
        </div>
      </div>

      {/* Knowledge Section */}
      <div className="group-content-section">
        <h3>Gruppenwissen</h3>
        <p className="help-text">
          Hinterlege hier bis zu drei Wissensbausteine für die Gruppe.
          Diese können später bei der Generierung genutzt werden.
        </p>

        <div className="form-group knowledge-management-section">
          {knowledgeEntries.map((entry, index) => (
            <div
              key={entry.id}
              className="knowledge-entry"
              style={{
                marginBottom: 'var(--spacing-large)',
                borderTop: index > 0 ? '1px solid var(--border-subtle)' : 'none',
                paddingTop: index > 0 ? 'var(--spacing-large)' : '0'
              }}
            >
              <div className="form-field-wrapper">
                <div className="anweisungen-header">
                  <label htmlFor={`knowledge-title-${entry.id}`}>Wissen #{index + 1}: Titel</label>
                  {!entry.isNew && isAdmin && (
                    <button
                      type="button"
                      onClick={() => handleKnowledgeDelete(entry.id)}
                      className="knowledge-delete-button icon-button danger"
                      disabled={isDeletingKnowledge}
                      aria-label={`Wissenseintrag ${index + 1} löschen`}
                    >
                      <HiOutlineTrash />
                    </button>
                  )}
                </div>
                <TextInput
                  id={`knowledge-title-${entry.id}`}
                  type="text"
                  value={entry.title}
                  onChange={(e) => handleKnowledgeChange(entry.id, 'title', e.target.value)}
                  placeholder="Kurzer, prägnanter Titel (z.B. 'OV Musterstadt Vorstand')"
                  maxLength={100}
                  disabled={!isAdmin || isSaving || isDeletingKnowledge}
                  className="form-input"
                />
              </div>
              <div className="form-field-wrapper">
                <label
                  htmlFor={`knowledge-content-${entry.id}`}
                  style={{ marginTop: 'var(--spacing-small)', display: 'block' }}
                >
                  Inhalt:
                </label>
                <textarea
                  id={`knowledge-content-${entry.id}`}
                  className="form-textarea anweisungen-textarea"
                  value={entry.content}
                  onChange={(e) => handleKnowledgeChange(entry.id, 'content', e.target.value)}
                  placeholder="Füge hier den Wissensinhalt ein..."
                  rows={6}
                  maxLength={MAX_CONTENT_LENGTH}
                  disabled={!isAdmin || isSaving || isDeletingKnowledge}
                />
                <p className="help-text character-count" style={{ textAlign: 'right', fontSize: '0.8em', marginTop: 'var(--spacing-xxsmall)' }}>
                  {entry.content?.length || 0} / {MAX_CONTENT_LENGTH} Zeichen
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Save Button Area */}
      {isAdmin && (
        <div className="group-actions">
          <button
            type="button"
            className="button primary"
            onClick={() => saveChanges()}
            disabled={!hasUnsavedChanges || isSaving}
          >
            {isSaving ? <Spinner size="small" /> : 'Änderungen speichern'}
          </button>
          
          {saveFeedbackMessage && (
            <div className={`save-feedback ${saveFeedbackType}`}>
              {saveFeedbackMessage}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default GroupDetailView; 