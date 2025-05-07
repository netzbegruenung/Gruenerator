import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Spinner from '../../../../components/common/Spinner';
import { handleError } from '../../../../components/utils/errorHandling'; // Assuming this utility exists
import { HiInformationCircle, HiPlus } from 'react-icons/hi';

const CustomGeneratorsTab = ({ user, templatesSupabase, onSuccessMessage, onErrorMessage }) => {
  const [generators, setGenerators] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedGeneratorId, setSelectedGeneratorId] = useState(null);
  const [view, setView] = useState('overview'); // 'overview' or 'detail'
  const navigate = useNavigate();

  useEffect(() => {
    const fetchGenerators = async () => {
      if (!user || !templatesSupabase) {
        setGenerators([]);
        return;
      }

      setLoading(true);
      onErrorMessage(''); // Clear previous errors

      try {
        const { data, error } = await templatesSupabase
          .from('custom_generators')
          .select('id, name, slug, title, description, form_schema, prompt, contact_email')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false });

        if (error) {
          throw error;
        }

        setGenerators(data || []);
        if (data && data.length > 0 && view === 'overview' && !selectedGeneratorId) {
          // Optional: Automatically select the first generator or keep overview
          // setSelectedGeneratorId(data[0].id);
          // setView('detail');
        } else if (data && data.length === 0) {
          setView('overview');
          setSelectedGeneratorId(null);
        }
        // Optional: onSuccessMessage('Benutzerdefinierte Generatoren geladen.');
      } catch (err) {
        console.error('[CustomGeneratorsTab] Fehler beim Laden der Generatoren:', err);
        handleError(err, 'Fehler beim Laden Ihrer benutzerdefinierten Generatoren.', onErrorMessage);
        setGenerators([]);
      } finally {
        setLoading(false);
      }
    };

    fetchGenerators();
  }, [user, templatesSupabase, onErrorMessage, view, selectedGeneratorId]);

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

  const renderNavigationPanel = () => (
    <div className="groups-vertical-navigation">
      <button
        className={`groups-vertical-tab ${view === 'overview' ? 'active' : ''}`}
        onClick={handleShowOverview}
      >
        Übersicht
      </button>

      {generators && generators.length > 0 && (
        <nav className="groups-vertical-tabs" aria-label="Generatoren Navigation">
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
    if (loading && !generators.length) {
      return (
        <div className="loading-container" style={{ display: 'flex', justifyContent: 'center', padding: 'var(--spacing-large)', alignItems: 'center', flexDirection: 'column' }}>
          <Spinner size="medium" />
          <p style={{ marginTop: 'var(--spacing-medium)' }}>Lade deine Generatoren...</p>
        </div>
      );
    }

    if (view === 'overview') {
      return (
        <div className="group-overview-container">
          <div className="group-content-card">
            <div className="group-info-panel">
              <div className="group-header-section">
                <div className="group-title-area">
                  <h2 className="profile-user-name" style={{ fontSize: '1.8rem' }}>Meine Generatoren</h2>
                </div>
              </div>
              <div className="group-overview-content">
                <section className="group-overview-section">
                  <h3>Eigene Grüne-Generatoren erstellen und verwalten</h3>
                  <p>
                    Hier findest du alle von dir erstellten benutzerdefinierten Generatoren. Du kannst neue Generatoren erstellen,
                    bestehende ansehen und sie direkt nutzen.
                  </p>
                  <p>
                    Wähle links einen Generator aus der Liste, um dessen Details anzuzeigen und ihn zu verwenden,
                    oder klicke auf "Neu", um einen weiteren Generator nach deinen Vorstellungen zu konfigurieren.
                  </p>
                </section>
                {generators.length === 0 && !loading && (
                  <section className="group-overview-section">
                    <p>Du hast noch keine eigenen Generatoren erstellt. Klicke auf "Neu", um deinen ersten Generator zu erstellen!</p>
                  </section>
                )}
                <div className="group-overview-cta">
                  <Link to="/create-generator" className="profile-action-button profile-primary-button" style={{ textDecoration: 'none' }}>
                    Neuen Generator erstellen
                    <HiPlus style={{ marginLeft: 'var(--spacing-xsmall)' }} />
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      );
    }

    if (view === 'detail' && selectedGeneratorId) {
      const generator = generators.find(g => g.id === selectedGeneratorId);
      if (!generator) {
        return <p>Ausgewählter Generator nicht gefunden. Bitte wähle einen aus der Liste.</p>;
      }
      return (
        <div className="profile-tab-content custom-generators-tab">
          <div className="group-content-card">
            <div className="group-info-panel" style={{ marginBottom: 'var(--spacing-medium)'}}>
                <div className="group-header-section" style={{ marginBottom: 'var(--spacing-small)'}}>
                    <div className="group-title-area">
                        <h3 className="profile-user-name" style={{ fontSize: '1.6rem', marginBottom: 'var(--spacing-xsmall)' }}>{generator.title || generator.name}</h3>
                    </div>
                    <Link to={`/generator/${generator.slug}`} className="btn btn-sm btn-tanne" style={{ textDecoration: 'none', alignSelf: 'center' }}>
                        Generator öffnen
                    </Link>
                </div>
                 {generator.description && <p className="text-muted" style={{marginBottom: 'var(--spacing-small)'}}>{generator.description}</p>}
                 <small className="text-muted">Interner Name: {generator.name} | URL: /generator/{generator.slug}</small>
                 {generator.contact_email && 
                    <p className="text-muted small" style={{marginTop: 'var(--spacing-xsmall)'}}>
                        Kontakt E-Mail: {generator.contact_email}
                    </p>
                 }
            </div>

            <hr className="form-divider-large" />
            
            <div className="generator-details-content">
              {generator.form_schema && generator.form_schema.fields && generator.form_schema.fields.length > 0 && (
                <div className="review-section" style={{marginBottom: 'var(--spacing-large)'}}>
                  <h4>Formularfelder</h4>
                  <ul className="list-group">
                    {generator.form_schema.fields.map((field, index) => (
                      <li key={index} className="list-group-item" style={{padding: 'var(--spacing-small) var(--spacing-medium)'}}>
                        <strong>{field.label || '(Ohne Label)'}</strong> ({field.name})<br />
                        <small className="text-muted">
                          Typ: {field.type === 'textarea' ? 'Langer Text' : (field.type === 'text' ? 'Kurzer Text' : field.type)},
                          {field.required ? ' Pflichtfeld' : ' Optional'}
                          {field.placeholder ? `, Platzhalter: "${field.placeholder}"` : ''}
                        </small>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {generator.prompt && (
                <div className="review-section">
                  <h4>Prompt-Vorlage</h4>
                  <pre className="review-prompt-display" style={{whiteSpace: 'pre-wrap', wordBreak: 'break-all'}}>{generator.prompt}</pre>
                </div>
              )}

              {!((generator.form_schema && generator.form_schema.fields && generator.form_schema.fields.length > 0) || generator.prompt) && (
                <p>Für diesen Generator sind keine detaillierten Feld- oder Prompt-Informationen verfügbar.</p>
              )}
            </div>
          </div>
        </div>
      );
    }
    
    if (!loading && generators.length === 0) {
      return (
        <div className="group-overview-container">
          <div className="group-content-card">
            <div className="group-info-panel">
              <div className="group-header-section">
                <div className="group-title-area">
                  <h2 className="profile-user-name" style={{ fontSize: '1.8rem' }}>Meine Generatoren</h2>
                </div>
              </div>
              <div className="group-overview-content">
                <section className="group-overview-section">
                  <p>Du hast noch keine eigenen Generatoren erstellt.</p>
                </section>
                <div className="group-overview-cta">
                  <Link to="/create-generator" className="profile-action-button profile-primary-button" style={{ textDecoration: 'none' }}>
                    Neuen Generator erstellen
                    <HiPlus style={{ marginLeft: 'var(--spacing-xsmall)' }} />
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
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