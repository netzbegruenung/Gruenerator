import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Spinner from '../../../../components/common/Spinner';
import ProfileTabSkeleton from '../../../../components/common/UI/ProfileTabSkeleton';
import { motion } from "motion/react";
import { handleError } from '../../../../components/utils/errorHandling';
import { HiInformationCircle, HiPlus, HiTrash, HiArrowRight } from 'react-icons/hi';
import apiClient from '../../../../components/utils/apiClient';

const CustomGeneratorsTab = ({ user, templatesSupabase, onSuccessMessage, onErrorMessage, isActive }) => {
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [selectedGeneratorId, setSelectedGeneratorId] = useState(null);
  const [view, setView] = useState('overview');
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const fetchGenerators = async () => {
    if (!user || !templatesSupabase) {
      return [];
    }
    onErrorMessage('');

    const { data, error } = await templatesSupabase
      .from('custom_generators')
      .select('id, name, slug, title, description, form_schema, prompt, contact_email')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      throw error;
    }
    return data || [];
  };

  const { data: generators = [], isLoading: loading, error: fetchError } = useQuery({
    queryKey: ['customGenerators', user?.id],
    queryFn: fetchGenerators,
    enabled: !!user && !!templatesSupabase && isActive !== false,
    onError: (err) => {
      console.error('[CustomGeneratorsTab] Fehler beim Laden der Grüneratoren (useQuery):', err);
      handleError(err, onErrorMessage);
    },
    onSuccess: (data) => {
      if (data && data.length > 0 && view === 'overview' && !selectedGeneratorId) {
      } else if (data && data.length === 0) {
        setView('overview');
        setSelectedGeneratorId(null);
      }
    }
  });

  useEffect(() => {
    if (fetchError) {
      setView('overview');
      setSelectedGeneratorId(null);
    }

    if (generators.length === 0) {
      setView('overview');
      setSelectedGeneratorId(null);
    } else if (selectedGeneratorId && !generators.find(g => g.id === selectedGeneratorId)) {
      setView('overview');
      setSelectedGeneratorId(null);
    }
  }, [generators, selectedGeneratorId, fetchError]);

  const handleSelectGenerator = (generatorId) => {
    setSelectedGeneratorId(generatorId);
    setView('detail');
    onSuccessMessage('');
    onErrorMessage('');
  };

  const handleShowOverview = () => {
    setSelectedGeneratorId(null);
    setView('overview');
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
      await apiClient.delete(`/custom_generator/${generatorId}`);

      onSuccessMessage('Grünerator erfolgreich gelöscht.');
      queryClient.invalidateQueries({ queryKey: ['customGenerators', user?.id] });
      
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

  const renderNavigationPanel = () => (
    <div className="groups-vertical-navigation">
      <button
        className={`groups-vertical-tab ${view === 'overview' ? 'active' : ''}`}
        onClick={handleShowOverview}
      >
        Übersicht
      </button>

      {generators && generators.length > 0 && (
        <nav className="groups-vertical-tabs" aria-label="Grüneratoren Navigation">
          {generators.map(gen => (
            <button
              key={gen.id}
              className={`groups-vertical-tab ${selectedGeneratorId === gen.id && view === 'detail' ? 'active' : ''}`}
              onClick={() => handleSelectGenerator(gen.id)}
            >
              {gen.title || gen.name}
            </button>
          ))}
        </nav>
      )}

      <Link to="/create-generator" className="groups-action-button create-new-group-button" style={{ textDecoration: 'none' }}>
        Neu
        <HiPlus />
      </Link>
    </div>
  );

  const renderContentPanel = () => {
    if (loading && generators.length === 0) {
      return (
        <ProfileTabSkeleton type="default" itemCount={4} />
      );
    }
    
    if (fetchError && generators.length === 0) {
      return (
        <div className="group-overview-container">
          <div className="group-content-card" style={{ textAlign: 'center', padding: 'var(--spacing-large)' }}>
            <HiInformationCircle size={48} style={{ color: 'var(--color-warning)', marginBottom: 'var(--spacing-medium)' }} />
            <h3>Fehler beim Laden</h3>
            <p>Deine Grüneratoren konnten nicht geladen werden.</p>
            <p><i>{fetchError.message || 'Bitte versuche es später erneut.'}</i></p>
            <button 
              onClick={() => queryClient.refetchQueries({ queryKey: ['customGenerators', user?.id] })}
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
          <div className="group-content-card">
            <div className="group-info-panel">
              <div className="group-header-section">
                <div className="group-title-area">
                  <h2 className="profile-user-name" style={{ fontSize: '1.8rem' }}>Meine Grüneratoren</h2>
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
                {generators.length === 0 && !loading && (
                  <section className="group-overview-section">
                    <p>Du hast noch keine eigenen Grüneratoren erstellt. Klicke auf "Neu", um deinen ersten Grünerator zu erstellen!</p>
                  </section>
                )}
                <div className="group-overview-cta">
                  <Link to="/create-generator" className="profile-action-button profile-primary-button" style={{ textDecoration: 'none' }}>
                    Neuen Grünerator erstellen
                    <HiPlus style={{ marginLeft: 'var(--spacing-xsmall)' }} />
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
            <div className="group-content-card" style={{ textAlign: 'center', padding: 'var(--spacing-large)' }}>
              <HiInformationCircle size={48} style={{ color: 'var(--color-info)', marginBottom: 'var(--spacing-medium)' }} />
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
          <div className="group-content-card">
            <div className="group-info-panel">
              <div className="group-header-section">
                <div className="group-title-area">
                  <h3 className="profile-user-name" style={{ fontSize: '1.6rem' }}>{generator.title || generator.name}</h3>
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
              {generator.form_schema && generator.form_schema.fields && generator.form_schema.fields.length > 0 && (
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

              {!((generator.form_schema && generator.form_schema.fields && generator.form_schema.fields.length > 0) || generator.prompt) && (
                <p>Für diesen Grünerator sind keine detaillierten Feld- oder Prompt-Informationen verfügbar.</p>
              )}
            </div>
          </div>
        </motion.div>
      );
    }
    
    return null;
  };

  return (
    <div className="profile-content groups-management-layout">
      <div className="groups-navigation-panel">
        {renderNavigationPanel()}
      </div>
      <div className="groups-content-panel profile-form-section">
        {renderContentPanel()}
      </div>
    </div>
  );
};

export default CustomGeneratorsTab; 