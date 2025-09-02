import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Spinner from '../../../../components/common/Spinner';
import { motion } from "motion/react";
import { handleError } from '../../../../components/utils/errorHandling';
import { HiInformationCircle, HiPlus, HiTrash, HiArrowRight, HiChatAlt2, HiPencil, HiCog } from 'react-icons/hi';
import { useOptimizedAuth } from '../../../../hooks/useAuth';
import HelpTooltip from '../../../../components/common/HelpTooltip';
// TODO: Document integration not yet complete - missing backend API integration and proper error handling
// import DocumentSelector from '../../../generators/components/DocumentSelector';
import { useCustomGenerators, useGeneratorDocuments, useAvailableDocuments, useQACollections } from '../../hooks/useProfileData';
import { useTabIndex } from '../../../../hooks/useTabIndex';
import { useRovingTabindex } from '../../../../hooks/useKeyboardNavigation';
import { announceToScreenReader } from '../../../../utils/focusManagement';
import { useBetaFeatures } from '../../../../hooks/useBetaFeatures';

// Q&A Components
import QACreator from '../../../qa/components/QACreator';
import QAList from '../../../qa/components/QAList';

const CustomGeneratorsTab = ({ user, onSuccessMessage, onErrorMessage, isActive }) => {
  const [selectedGeneratorId, setSelectedGeneratorId] = useState(null);
  const [view, setView] = useState('overview');
  const [showDocumentManagement, setShowDocumentManagement] = useState(false);
  const [selectedQAId, setSelectedQAId] = useState(null);
  const [showQACreator, setShowQACreator] = useState(false);
  const [editingQA, setEditingQA] = useState(null);
  const navigate = useNavigate();
  
  // Tab index configuration
  const tabIndex = useTabIndex('PROFILE_GENERATORS');
  
  // Beta features check
  const { canAccessBetaFeature } = useBetaFeatures();
  const isQAEnabled = canAccessBetaFeature('qa');
  
  const { user: authUser, loading } = useOptimizedAuth();

  // Use centralized hooks
  const { 
    query: generatorsQuery, 
    deleteGenerator, 
    isDeleting, 
    deleteError 
  } = useCustomGenerators({ isActive });

  const { 
    query: documentsQuery, 
    addDocuments, 
    removeDocument,
    isAddingDocuments,
    isRemovingDocument 
  } = useGeneratorDocuments(selectedGeneratorId);

  const { data: availableDocuments } = useAvailableDocuments();

  // Q&A hooks (only if beta feature is enabled)
  const { 
    query: qaQuery, 
    createQACollection, 
    updateQACollection, 
    deleteQACollection,
    isCreating: isCreatingQA,
    isUpdating: isUpdatingQA, 
    isDeleting: isDeletingQA
  } = useQACollections({ isActive: isActive && isQAEnabled });

  // Simplified data access
  const generators = generatorsQuery.data || [];
  const generatorDocuments = documentsQuery.data || [];
  const qaCollections = qaQuery?.data || [];
  const fetchError = generatorsQuery.error;
  const qaError = qaQuery?.error;

  useEffect(() => {
    if (fetchError) {
      console.error('[CustomGeneratorsTab] Fehler beim Laden der Grüneratoren:', fetchError);
      handleError(fetchError, onErrorMessage);
      setView('overview');
      setSelectedGeneratorId(null);
    }
    if (deleteError) {
      handleError(deleteError, onErrorMessage);
    }
    if (qaError) {
      console.error('[CustomGeneratorsTab] Fehler beim Laden der Q&A-Sammlungen:', qaError);
      handleError(qaError, onErrorMessage);
    }
  }, [fetchError, deleteError, qaError, onErrorMessage]);

  useEffect(() => {
    if (!generators) return;

    if (generators.length === 0) {
      setView('overview');
      setSelectedGeneratorId(null);
    } else if (selectedGeneratorId && !generators.find(g => g.id === selectedGeneratorId)) {
      setView('overview');
      setSelectedGeneratorId(null);
    }
  }, [generators, selectedGeneratorId]);

  const handleSelectGenerator = (generatorId) => {
    setSelectedGeneratorId(generatorId);
    setView('detail');
    setShowDocumentManagement(false);
    onSuccessMessage('');
    onErrorMessage('');
  };

  const handleShowOverview = () => {
    setSelectedGeneratorId(null);
    setView('overview');
    setShowDocumentManagement(false);
    onSuccessMessage('');
    onErrorMessage('');
  };

  const handleDeleteGenerator = async (generatorId) => {
    if (!window.confirm('Möchten Sie diesen Grünerator wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.')) {
      return;
    }

    onErrorMessage('');
    onSuccessMessage('');

    try {
      await deleteGenerator(generatorId);
      onSuccessMessage('Grünerator erfolgreich gelöscht.');
      
      if (selectedGeneratorId === generatorId) {
        handleShowOverview();
      }
    } catch (err) {
      // Error already handled by useCustomGenerators hook
    }
  };

  // Add documents to generator using new hook
  const handleAddDocuments = async (generatorId, newDocuments) => {
    if (!newDocuments || newDocuments.length === 0) return;
    
    onErrorMessage('');
    
    const documentIds = newDocuments
      .filter(doc => !generatorDocuments.find(gd => gd.id === doc.id))
      .map(doc => doc.id);
    
    if (documentIds.length === 0) {
      onErrorMessage('Alle ausgewählten Dokumente sind bereits hinzugefügt.');
      return;
    }
    
    try {
      await addDocuments(documentIds);
      onSuccessMessage(`${documentIds.length} Dokument(e) erfolgreich hinzugefügt.`);
      setShowDocumentManagement(false);
    } catch (error) {
      handleError(error, onErrorMessage);
    }
  };

  // Remove document from generator using new hook
  const handleRemoveDocument = async (documentId, documentTitle) => {
    if (!window.confirm(`Möchten Sie das Dokument "${documentTitle}" wirklich aus diesem Generator entfernen?`)) {
      return;
    }
    
    onErrorMessage('');
    
    try {
      await removeDocument(documentId);
      onSuccessMessage('Dokument erfolgreich entfernt.');
    } catch (error) {
      handleError(error, onErrorMessage);
    }
  };

  // Q&A handlers
  const handleCreateQA = () => {
    setShowQACreator(true);
    setEditingQA(null);
    onSuccessMessage('');
    onErrorMessage('');
  };

  const handleEditQA = (qaId) => {
    const qa = qaCollections.find(q => q.id === qaId);
    if (qa) {
      setEditingQA(qa);
      setShowQACreator(true);
      onSuccessMessage('');
      onErrorMessage('');
    }
  };

  const handleSaveQA = async (qaData) => {
    try {
      if (editingQA) {
        await updateQACollection(editingQA.id, qaData);
        onSuccessMessage('Q&A-Sammlung erfolgreich aktualisiert.');
      } else {
        await createQACollection(qaData);
        onSuccessMessage('Q&A-Sammlung erfolgreich erstellt.');
      }
      setShowQACreator(false);
      setEditingQA(null);
    } catch (error) {
      console.error('[CustomGeneratorsTab] Fehler beim Speichern der Q&A:', error);
      handleError(error, onErrorMessage);
    }
  };

  const handleDeleteQA = async (qaId) => {
    const qa = qaCollections.find(q => q.id === qaId);
    if (!qa) return;
    
    if (!window.confirm(`Möchten Sie die Q&A-Sammlung "${qa.name}" wirklich löschen?`)) {
      return;
    }

    try {
      await deleteQACollection(qaId);
      onSuccessMessage('Q&A-Sammlung erfolgreich gelöscht.');
    } catch (error) {
      console.error('[CustomGeneratorsTab] Fehler beim Löschen der Q&A:', error);
      handleError(error, onErrorMessage);
    }
  };

  const handleViewQA = (qaId) => {
    navigate(`/qa/${qaId}`);
  };
  
  // Navigation items for roving tabindex
  const navigationItems = [
    'overview',
    ...(generators ? generators.map(g => `generator-${g.id}`) : []),
    ...(isQAEnabled && qaCollections ? qaCollections.map(q => `qa-${q.id}`) : []),
    'create-new'
  ];
  
  // Roving tabindex for navigation
  const { getItemProps } = useRovingTabindex({
    items: navigationItems,
    defaultActiveItem: view === 'overview' ? 'overview' : 
                      view === 'qa-detail' ? `qa-${selectedQAId}` : 
                      `generator-${selectedGeneratorId}`
  });

  const renderNavigationPanel = () => (
    <div 
      className="profile-vertical-navigation"
      role="tablist"
      aria-label="Grüneratoren Navigation"
      aria-orientation="vertical"
    >
      <button
        {...getItemProps('overview')}
        className={`profile-vertical-tab ${view === 'overview' ? 'active' : ''}`}
        onClick={handleShowOverview}
        role="tab"
        aria-selected={view === 'overview'}
        aria-controls="overview-panel"
        id="overview-tab"
      >
        Übersicht
      </button>

      {generators && Array.isArray(generators) && generators.length > 0 && (
        <>
          {generators.map(gen => (
            <button
              key={gen.id}
              {...getItemProps(`generator-${gen.id}`)}
              className={`profile-vertical-tab ${selectedGeneratorId === gen.id && view === 'detail' ? 'active' : ''}`}
              onClick={() => handleSelectGenerator(gen.id)}
              role="tab"
              aria-selected={selectedGeneratorId === gen.id && view === 'detail'}
              aria-controls={`generator-${gen.id}-panel`}
              id={`generator-${gen.id}-tab`}
              aria-label={`Generator ${gen.title || gen.name}`}
            >
              <HiCog className="qa-icon" />
              {gen.title || gen.name}
            </button>
          ))}
        </>
      )}

      {isQAEnabled && qaCollections && Array.isArray(qaCollections) && qaCollections.length > 0 && (
        <>
          {qaCollections.map(qa => (
            <button
              key={qa.id}
              {...getItemProps(`qa-${qa.id}`)}
              className={`profile-vertical-tab qa-tab ${selectedQAId === qa.id && view === 'qa-detail' ? 'active' : ''}`}
              onClick={() => {
                setSelectedQAId(qa.id);
                setView('qa-detail');
                setSelectedGeneratorId(null);
                setShowDocumentManagement(false);
                onSuccessMessage('');
                onErrorMessage('');
              }}
              role="tab"
              aria-selected={selectedQAId === qa.id && view === 'qa-detail'}
              aria-controls={`qa-${qa.id}-panel`}
              id={`qa-${qa.id}-tab`}
              aria-label={`Q&A ${qa.name}`}
            >
              <HiChatAlt2 className="qa-icon" />
              {qa.name}
            </button>
          ))}
        </>
      )}

      <div className="create-new-options">
        <Link 
          to="/create-generator" 
          className="groups-action-button create-new-group-button no-decoration-link"
          {...getItemProps('create-new')}
          role="tab"
          aria-label="Neuen Generator erstellen"
        >
          <HiPlus />
          Generator
        </Link>
        {isQAEnabled && (
          <button
            className="groups-action-button create-new-group-button qa-create-button"
            onClick={handleCreateQA}
            aria-label="Neue Q&A-Sammlung erstellen"
          >
            <HiChatAlt2 />
            Q&A
          </button>
        )}
      </div>
    </div>
  );

  const renderContentPanel = () => {
    if (fetchError && (!generators || generators.length === 0)) {
      return (
        <div className="group-overview-container">
          <div className="profile-content-card centered-content-card">
            <HiInformationCircle size={48} className="warning-icon" />
            <h3>Fehler beim Laden</h3>
            <p>Deine Grüneratoren konnten nicht geladen werden.</p>
            <p><i>{fetchError.message || 'Bitte versuche es später erneut.'}</i></p>
            <button 
              onClick={() => generatorsQuery.refetch()}
              className="profile-action-button profile-secondary-button"
            >
              Erneut versuchen
            </button>
          </div>
        </div>
      );
    }

    // Q&A Creator View - Check this BEFORE view checks to ensure it takes priority
    if (showQACreator && isQAEnabled) {
      return (
        <motion.div 
          className="profile-tab-content custom-generators-tab"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3 }}
          role="tabpanel"
          id="qa-creator-panel"
          aria-labelledby="qa-creator-tab"
        >
          <div className="profile-content-card">
            <div className="profile-info-panel">
              <div className="profile-header-section">
                <div className="group-title-area">
                  <h3 className="profile-user-name medium-profile-title">
                    {editingQA ? 'Q&A bearbeiten' : 'Neue Q&A erstellen'}
                  </h3>
                </div>
                <div className="custom-generator-actions">
                  <button 
                    onClick={() => {
                      setShowQACreator(false);
                      setEditingQA(null);
                      setView('overview');
                    }}
                    className="custom-generator-button custom-generator-button-delete"
                    title="Zurück"
                    aria-label="Zurück zur Übersicht"
                  >
                    ← Zurück
                  </button>
                </div>
              </div>

              <QACreator
                onSave={handleSaveQA}
                availableDocuments={availableDocuments}
                editingCollection={editingQA}
                loading={isCreatingQA || isUpdatingQA}
                onCancel={() => {
                  setShowQACreator(false);
                  setEditingQA(null);
                  setView('overview');
                }}
              />
            </div>
          </div>
        </motion.div>
      );
    }

    if (view === 'overview') {
      return (
        <motion.div 
          className="group-overview-container"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3 }}
          role="tabpanel"
          id="overview-panel"
          aria-labelledby="overview-tab"
        >
          <div className="profile-content-card">
            <div className="profile-info-panel">
              <div className="profile-header-section">
                <div className="group-title-area">
                  <div className="header-with-help">
                    <h2 className="profile-user-name large-profile-title">Meine Grüneratoren</h2>
                    <HelpTooltip>
                      <p>
                        Hier kannst du eigene Grüneratoren erstellen und verwalten.
                      </p>
                      <p>
                        <strong>Tipp:</strong> Erstelle spezialisierte Grüneratoren für wiederkehrende Aufgaben in deinem Bereich.
                      </p>
                    </HelpTooltip>
                  </div>
                </div>
              </div>
              <div className="group-overview-content">
                <section className="group-overview-section">
                  <h3>Eigene Grüneratoren erstellen und verwalten</h3>
                  <p>
                    Hier findest du alle von dir erstellten benutzerdefinierten Grüneratoren{isQAEnabled ? ' und Q&A-Sammlungen' : ''}. 
                    Du kannst neue Grüneratoren erstellen, bestehende ansehen und sie direkt nutzen.
                    {isQAEnabled ? ' Zusätzlich kannst du intelligente Q&A-Systeme basierend auf deinen Dokumenten erstellen.' : ''}
                  </p>
                  <p>
                    Wähle links einen Grünerator{isQAEnabled ? ' oder eine Q&A-Sammlung' : ''} aus der Liste, um dessen Details anzuzeigen und ihn zu verwenden,
                    oder klicke auf "Neu", um weitere Inhalte nach deinen Vorstellungen zu konfigurieren.
                  </p>
                </section>
                {(!generators || generators.length === 0) && (!isQAEnabled || !qaCollections || qaCollections.length === 0) && (
                  <section className="group-overview-section">
                    <p>Du hast noch keine eigenen Grüneratoren{isQAEnabled ? ' oder Q&A-Sammlungen' : ''} erstellt. 
                    Klicke auf "Neu", um deine ersten Inhalte zu erstellen!</p>
                  </section>
                )}
                <div className="group-overview-cta">
                  <Link 
                    to="/create-generator" 
                    className="profile-action-button profile-primary-button no-decoration-link"
                    tabIndex={tabIndex.createNewLink}
                    aria-label="Neuen Grünerator erstellen"
                  >
                    Neuen Grünerator erstellen
                    <HiPlus className="plus-icon" />
                  </Link>
                  {isQAEnabled && (
                    <button
                      onClick={handleCreateQA}
                      className="profile-action-button profile-secondary-button"
                      aria-label="Neue Q&A-Sammlung erstellen"
                    >
                      Q&A-Sammlung erstellen
                      <HiChatAlt2 className="plus-icon" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      );
    }

    if (view === 'detail' && selectedGeneratorId) {
      const generator = generators.find(g => g.id === selectedGeneratorId);
      if (!generator) {
        return (
          <div className="group-overview-container">
            <div className="profile-content-card" style={{ textAlign: 'center', padding: 'var(--spacing-large)' }}>
              <HiInformationCircle size={48} className="info-icon" />
              <h3>Grünerator nicht gefunden</h3>
              <p>Der ausgewählte Grünerator ist nicht mehr verfügbar. Möglicherweise wurde er gelöscht.</p>
              <button onClick={handleShowOverview} className="profile-action-button profile-secondary-button">
                Zurück zur Übersicht
              </button>
            </div>
          </div>
        );
      }
      return (
        <motion.div 
          className="profile-tab-content custom-generators-tab"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3 }}
          role="tabpanel"
          id={`generator-${selectedGeneratorId}-panel`}
          aria-labelledby={`generator-${selectedGeneratorId}-tab`}
        >
          <div className="profile-content-card">
            <div className="profile-info-panel">
              <div className="profile-header-section">
                <div className="group-title-area">
                  <h3 className="profile-user-name medium-profile-title">{generator.title || generator.name}</h3>
                </div>
                <div className="custom-generator-actions">
                  <Link 
                    to={`/generator/${generator.slug}`} 
                    className="custom-generator-button custom-generator-button-open"
                    title="Öffnen"
                    tabIndex={tabIndex.openButton}
                    aria-label={`Grünerator ${generator.title || generator.name} öffnen`}
                  >
                    <HiArrowRight />
                  </Link>
                  <button 
                    onClick={() => handleDeleteGenerator(generator.id)}
                    className="custom-generator-button custom-generator-button-delete"
                    disabled={isDeleting}
                    title="Löschen"
                    tabIndex={tabIndex.deleteButton}
                    aria-label={`Grünerator ${generator.title || generator.name} löschen`}
                  >
                    {isDeleting ? <Spinner size="xsmall" /> : <HiTrash />}
                  </button>
                </div>
              </div>

              <div className="generator-info-grid">
                {generator.description && (
                  <>
                    <span className="generator-info-label">Beschreibung</span>
                    <span className="generator-info-value">{generator.description}</span>
                  </>
                )}
                <span className="generator-info-label">Interner Name</span>
                <span className="generator-info-value">{generator.name}</span>
                <span className="generator-info-label">URL</span>
                <span className="generator-info-value">/generator/{generator.slug}</span>
                {generator.contact_email && (
                  <>
                    <span className="generator-info-label">Kontakt</span>
                    <span className="generator-info-value">{generator.contact_email}</span>
                  </>
                )}
              </div>
            </div>

            <hr className="form-divider-large" />
            
            <div className="generator-details-content">
              {generator.form_schema && generator.form_schema.fields && Array.isArray(generator.form_schema.fields) && generator.form_schema.fields.length > 0 && (
                <div className="generator-form-fields">
                  <h4>Formularfelder</h4>
                  {generator.form_schema.fields.map((field, index) => (
                    <div key={index} className="field-item">
                      <div className="field-header">
                        <span className="field-name">{field.label || field.name}</span>
                        <span className="field-required">{field.required ? 'Pflichtfeld' : 'Optional'}</span>
                      </div>
                      <div className="field-details">
                        <span>Typ: {field.type === 'textarea' ? 'Langer Text' : (field.type === 'text' ? 'Kurzer Text' : field.type)}</span>
                        {field.placeholder && <span>Platzhalter: "{field.placeholder}"</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {generator.prompt && (
                <div>
                  <h4>Prompt-Vorlage</h4>
                  <div className="prompt-container">
                    <div className="prompt-content">{generator.prompt}</div>
                  </div>
                </div>
              )}

              {!((generator.form_schema && generator.form_schema.fields && Array.isArray(generator.form_schema.fields) && generator.form_schema.fields.length > 0) || generator.prompt) && (
                <p>Für diesen Grünerator sind keine detaillierten Feld- oder Prompt-Informationen verfügbar.</p>
              )}
            </div>

            {/* TODO: Document integration not yet complete - missing backend API integration and proper error handling */}
            
          </div>
        </motion.div>
      );
    }


    // Q&A Detail View
    if (view === 'qa-detail' && selectedQAId && isQAEnabled) {
      const qa = qaCollections.find(q => q.id === selectedQAId);
      if (!qa) {
        return (
          <div className="group-overview-container">
            <div className="profile-content-card" style={{ textAlign: 'center', padding: 'var(--spacing-large)' }}>
              <HiInformationCircle size={48} className="info-icon" />
              <h3>Q&A-Sammlung nicht gefunden</h3>
              <p>Die ausgewählte Q&A-Sammlung ist nicht mehr verfügbar. Möglicherweise wurde sie gelöscht.</p>
              <button onClick={handleShowOverview} className="profile-action-button profile-secondary-button">
                Zurück zur Übersicht
              </button>
            </div>
          </div>
        );
      }
      
      return (
        <motion.div 
          className="profile-tab-content custom-generators-tab"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3 }}
          role="tabpanel"
          id={`qa-${selectedQAId}-panel`}
          aria-labelledby={`qa-${selectedQAId}-tab`}
        >
          <div className="profile-content-card">
            <div className="profile-info-panel">
              <div className="profile-header-section">
                <div className="group-title-area">
                  <h3 className="profile-user-name medium-profile-title">{qa.name}</h3>
                </div>
                <div className="custom-generator-actions">
                  <button 
                    onClick={() => handleViewQA(qa.id)}
                    className="custom-generator-button custom-generator-button-open"
                    title="Q&A öffnen"
                    aria-label={`Q&A-Sammlung ${qa.name} öffnen`}
                  >
                    <HiArrowRight />
                  </button>
                  <button 
                    onClick={() => handleEditQA(qa.id)}
                    className="custom-generator-button custom-generator-button-open"
                    title="Q&A bearbeiten"
                    aria-label={`Q&A-Sammlung ${qa.name} bearbeiten`}
                  >
                    <HiPencil />
                  </button>
                  <button 
                    onClick={() => handleDeleteQA(qa.id)}
                    className="custom-generator-button custom-generator-button-delete"
                    disabled={isDeletingQA}
                    title="Q&A löschen"
                    aria-label={`Q&A-Sammlung ${qa.name} löschen`}
                  >
                    {isDeletingQA ? <Spinner size="xsmall" /> : <HiTrash />}
                  </button>
                </div>
              </div>

              <div className="generator-info-grid">
                {qa.description && (
                  <>
                    <span className="generator-info-label">Beschreibung</span>
                    <span className="generator-info-value">{qa.description}</span>
                  </>
                )}
                <span className="generator-info-label">Anzahl Dokumente</span>
                <span className="generator-info-value">{qa.document_count || 0}</span>
                <span className="generator-info-label">Erstellt</span>
                <span className="generator-info-value">{new Date(qa.created_at).toLocaleDateString('de-DE')}</span>
                {qa.view_count && (
                  <>
                    <span className="generator-info-label">Aufrufe</span>
                    <span className="generator-info-value">{qa.view_count}</span>
                  </>
                )}
              </div>

              <hr className="form-divider-large" />
              
              <div className="generator-details-content">
                {qa.custom_prompt && (
                  <div>
                    <h4>Benutzerdefinierte Anweisungen</h4>
                    <div className="prompt-container">
                      <div className="prompt-content">{qa.custom_prompt}</div>
                    </div>
                  </div>
                )}

                {qa.documents && qa.documents.length > 0 && (
                  <div>
                    <h4>Verwendete Dokumente</h4>
                    <div className="qa-documents-list">
                      {qa.documents.map((doc, index) => (
                        <div key={doc.id || index} className="qa-document-item">
                          <HiInformationCircle className="document-icon" />
                          <span>{doc.title || doc.name || `Dokument ${index + 1}`}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </motion.div>
      );
    }
    
    return null;
  };

  if (generatorsQuery.isLoading && !generatorsQuery.data) {
    return (
      <div className="profile-tab-content">
        <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}>
          <Spinner size="medium" />
        </div>
      </div>
    );
  }

  return (
    <motion.div 
      className="profile-content profile-management-layout"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
    >
      <div className="groups-navigation-panel">
        {renderNavigationPanel()}
      </div>
      <div className="groups-content-panel profile-form-section">
        {renderContentPanel()}
      </div>
    </motion.div>
  );
};

export default CustomGeneratorsTab; 