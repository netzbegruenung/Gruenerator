import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Spinner from '../../../../components/common/Spinner';
import { motion } from "motion/react";
import { handleError } from '../../../../components/utils/errorHandling';
import { HiInformationCircle, HiPlus, HiTrash, HiArrowRight } from 'react-icons/hi';
import { useOptimizedAuth } from '../../../../hooks/useAuth';
import HelpTooltip from '../../../../components/common/HelpTooltip';
import apiClient from '../../../../components/utils/apiClient';
import DocumentSelector from '../../../generators/components/DocumentSelector';

const CustomGeneratorsTab = ({ user, onSuccessMessage, onErrorMessage, isActive }) => {
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [selectedGeneratorId, setSelectedGeneratorId] = useState(null);
  const [view, setView] = useState('overview');
  const [documentsLoading, setDocumentsLoading] = useState(false);
  const [generatorDocuments, setGeneratorDocuments] = useState([]);
  const [showDocumentManagement, setShowDocumentManagement] = useState(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  
  const { user: authUser, loading } = useOptimizedAuth();

  const fetchGenerators = async () => {
    if (!authUser) {
      throw new Error('Not authenticated');
    }
    onErrorMessage('');

    try {
      const response = await apiClient.get('/auth/custom-generators');
      return response.data.generators || [];
    } catch (error) {
      throw error;
    }
  };

  const { data: generatorsData = [], error: fetchError } = useQuery({
    queryKey: ['customGenerators', authUser?.id],
    queryFn: fetchGenerators,
    enabled: !!authUser && !loading && isActive,
    refetchOnMount: 'always',
    refetchOnWindowFocus: false
  });

  // Ensure generators is always an array
  const generators = Array.isArray(generatorsData) ? generatorsData : [];

  useEffect(() => {
    if (fetchError) {
      console.error('[CustomGeneratorsTab] Fehler beim Laden der Grüneratoren:', fetchError);
      handleError(fetchError, onErrorMessage);
      setView('overview');
      setSelectedGeneratorId(null);
    }
  }, [fetchError, onErrorMessage]);

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
    setGeneratorDocuments([]);
    onSuccessMessage('');
    onErrorMessage('');
    // Load documents for the selected generator
    loadGeneratorDocuments(generatorId);
  };

  const handleShowOverview = () => {
    setSelectedGeneratorId(null);
    setView('overview');
    setShowDocumentManagement(false);
    setGeneratorDocuments([]);
    onSuccessMessage('');
    onErrorMessage('');
  };

  const handleDeleteGenerator = async (generatorId) => {
    if (!window.confirm('Möchten Sie diesen Grünerator wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.')) {
      return;
    }

    setDeleteLoading(true);
    onErrorMessage('');
    onSuccessMessage('');

    try {
      await apiClient.delete(`/auth/custom-generators/${generatorId}`);

      onSuccessMessage('Grünerator erfolgreich gelöscht.');
      queryClient.invalidateQueries({ queryKey: ['customGenerators', authUser?.id] });
      
      if (selectedGeneratorId === generatorId) {
        handleShowOverview();
      }

    } catch (err) {
      console.error('[CustomGeneratorsTab] Fehler beim Löschen des Grünerators:', err);
      handleError(err, onErrorMessage);
    } finally {
      setDeleteLoading(false);
    }
  };

  // Load documents for a generator
  const loadGeneratorDocuments = async (generatorId) => {
    if (!generatorId) return;
    
    setDocumentsLoading(true);
    try {
      const response = await apiClient.get(`/custom_generator/${generatorId}/documents`);
      setGeneratorDocuments(response.data.documents || []);
    } catch (error) {
      console.error('[CustomGeneratorsTab] Error loading generator documents:', error);
      handleError(error, onErrorMessage);
    } finally {
      setDocumentsLoading(false);
    }
  };

  // Add documents to generator
  const handleAddDocuments = async (generatorId, newDocuments) => {
    if (!newDocuments || newDocuments.length === 0) return;
    
    setDocumentsLoading(true);
    onErrorMessage('');
    
    try {
      const documentIds = newDocuments
        .filter(doc => !generatorDocuments.find(gd => gd.id === doc.id))
        .map(doc => doc.id);
      
      if (documentIds.length === 0) {
        onErrorMessage('Alle ausgewählten Dokumente sind bereits hinzugefügt.');
        return;
      }
      
      await apiClient.post(`/custom_generator/${generatorId}/documents`, { documentIds });
      
      onSuccessMessage(`${documentIds.length} Dokument(e) erfolgreich hinzugefügt.`);
      await loadGeneratorDocuments(generatorId);
      setShowDocumentManagement(false);
    } catch (error) {
      console.error('[CustomGeneratorsTab] Error adding documents:', error);
      handleError(error, onErrorMessage);
    } finally {
      setDocumentsLoading(false);
    }
  };

  // Remove document from generator
  const handleRemoveDocument = async (generatorId, documentId, documentTitle) => {
    if (!window.confirm(`Möchten Sie das Dokument "${documentTitle}" wirklich aus diesem Generator entfernen?`)) {
      return;
    }
    
    setDocumentsLoading(true);
    onErrorMessage('');
    
    try {
      await apiClient.delete(`/custom_generator/${generatorId}/documents/${documentId}`);
      onSuccessMessage('Dokument erfolgreich entfernt.');
      await loadGeneratorDocuments(generatorId);
    } catch (error) {
      console.error('[CustomGeneratorsTab] Error removing document:', error);
      handleError(error, onErrorMessage);
    } finally {
      setDocumentsLoading(false);
    }
  };

  const renderNavigationPanel = () => (
    <div className="profile-vertical-navigation">
      <button
        className={`profile-vertical-tab ${view === 'overview' ? 'active' : ''}`}
        onClick={handleShowOverview}
      >
        Übersicht
      </button>

      {generators && Array.isArray(generators) && generators.length > 0 && (
        <nav className="profile-vertical-tabs" aria-label="Grüneratoren Navigation">
          {generators.map(gen => (
            <button
              key={gen.id}
              className={`profile-vertical-tab ${selectedGeneratorId === gen.id && view === 'detail' ? 'active' : ''}`}
              onClick={() => handleSelectGenerator(gen.id)}
            >
              {gen.title || gen.name}
            </button>
          ))}
        </nav>
      )}

      <Link to="/create-generator" className="groups-action-button create-new-group-button no-decoration-link">
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
              onClick={() => queryClient.refetchQueries({ queryKey: ['customGenerators', authUser?.id] })}
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
                  <Link to="/create-generator" className="profile-action-button profile-primary-button no-decoration-link">
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
                  >
                    <HiArrowRight />
                  </Link>
                  <button 
                    onClick={() => handleDeleteGenerator(generator.id)}
                    className="custom-generator-button custom-generator-button-delete"
                    disabled={deleteLoading}
                    title="Löschen"
                  >
                    {deleteLoading ? <Spinner size="xsmall" /> : <HiTrash />}
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

            <hr className="form-divider-large" />

            {/* Documents Section */}
            <div className="generator-documents-section">
              <div className="section-header">
                <h4>Wissensquellen</h4>
                <button
                  type="button"
                  onClick={() => setShowDocumentManagement(!showDocumentManagement)}
                  className="btn-secondary size-s"
                  disabled={documentsLoading}
                >
                  {showDocumentManagement ? 'Schließen' : 'Dokumente verwalten'}
                </button>
              </div>

              {/* Current Documents Display */}
              {documentsLoading ? (
                <div className="documents-loading">
                  <Spinner size="small" />
                  <span>Dokumente laden...</span>
                </div>
              ) : generatorDocuments.length > 0 ? (
                <div className="current-documents">
                  <p className="documents-description">
                    Dieser Generator hat Zugang zu <strong>{generatorDocuments.length}</strong> Dokument(en) als Wissensquelle:
                  </p>
                  <div className="documents-list">
                    {generatorDocuments.map((document) => (
                      <div key={document.id} className="document-item">
                        <div className="document-info">
                          <div className="document-title">
                            <strong>{document.title}</strong>
                          </div>
                          <div className="document-meta">
                            <span>{document.page_count} Seiten</span>
                            <span>{document.filename}</span>
                            <span>Hinzugefügt: {new Date(document.added_to_generator_at).toLocaleDateString('de-DE')}</span>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemoveDocument(generator.id, document.id, document.title)}
                          className="remove-document-btn"
                          disabled={documentsLoading}
                          title="Dokument entfernen"
                        >
                          <HiTrash />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="no-documents">
                  <p>Dieser Generator hat noch keine Wissensquellen. Fügen Sie Dokumente hinzu, damit Claude auf spezifische Inhalte zugreifen und diese zitieren kann.</p>
                </div>
              )}

              {/* Document Management Interface */}
              {showDocumentManagement && (
                <div className="document-management">
                  <h5>Dokumente hinzufügen</h5>
                  <DocumentSelector 
                    selectedDocuments={generatorDocuments}
                    onDocumentsChange={(documents) => {
                      // Filter out already associated documents and add only new ones
                      const newDocuments = documents.filter(doc => 
                        !generatorDocuments.find(gd => gd.id === doc.id)
                      );
                      if (newDocuments.length > 0) {
                        handleAddDocuments(generator.id, newDocuments);
                      }
                    }}
                  />
                </div>
              )}
            </div>
          </div>
        </motion.div>
      );
    }
    
    return null;
  };

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