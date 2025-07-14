import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Spinner from '../../../../components/common/Spinner';
import { motion } from "motion/react";
import { handleError } from '../../../../components/utils/errorHandling';
import { HiInformationCircle, HiPlus, HiTrash, HiArrowRight } from 'react-icons/hi';
import { useOptimizedAuth } from '../../../../hooks/useAuth';
import HelpTooltip from '../../../../components/common/HelpTooltip';
// TODO: Document integration not yet complete - missing backend API integration and proper error handling
// import DocumentSelector from '../../../generators/components/DocumentSelector';
import { useCustomGenerators, useGeneratorDocuments, useAvailableDocuments } from '../../hooks/useProfileData';
import { useTabIndex } from '../../../../hooks/useTabIndex';
import { useRovingTabindex } from '../../../../hooks/useKeyboardNavigation';
import { announceToScreenReader } from '../../../../utils/focusManagement';

const CustomGeneratorsTab = ({ user, onSuccessMessage, onErrorMessage, isActive }) => {
  const [selectedGeneratorId, setSelectedGeneratorId] = useState(null);
  const [view, setView] = useState('overview');
  const [showDocumentManagement, setShowDocumentManagement] = useState(false);
  const navigate = useNavigate();
  
  // Tab index configuration
  const tabIndex = useTabIndex('PROFILE_GENERATORS');
  
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

  // Simplified data access
  const generators = generatorsQuery.data || [];
  const generatorDocuments = documentsQuery.data || [];
  const fetchError = generatorsQuery.error;

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
  }, [fetchError, deleteError, onErrorMessage]);

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
  
  // Navigation items for roving tabindex
  const navigationItems = [
    'overview',
    ...(generators ? generators.map(g => `generator-${g.id}`) : []),
    'create-new'
  ];
  
  // Roving tabindex for navigation
  const { getItemProps } = useRovingTabindex({
    items: navigationItems,
    defaultActiveItem: view === 'overview' ? 'overview' : `generator-${selectedGeneratorId}`
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
              {gen.title || gen.name}
            </button>
          ))}
        </>
      )}

      <Link 
        to="/create-generator" 
        className="groups-action-button create-new-group-button no-decoration-link"
        {...getItemProps('create-new')}
        role="tab"
        aria-label="Neuen Generator erstellen"
      >
        Neu
        <HiPlus />
      </Link>
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
                    Hier findest du alle von dir erstellten benutzerdefinierten Grüneratoren. Du kannst neue Grüneratoren erstellen,
                    bestehende ansehen und sie direkt nutzen.
                  </p>
                  <p>
                    Wähle links einen Grünerator aus der Liste, um dessen Details anzuzeigen und ihn zu verwenden,
                    oder klicke auf "Neu", um einen weiteren Grünerator nach deinen Vorstellungen zu konfigurieren.
                  </p>
                </section>
                {(!generators || generators.length === 0) && (
                  <section className="group-overview-section">
                    <p>Du hast noch keine eigenen Grüneratoren erstellt. Klicke auf "Neu", um deinen ersten Grünerator zu erstellen!</p>
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