import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from "motion/react";
import StyledCheckbox from '../../../../components/common/AnimatedCheckbox';
import { HiOutlineExternalLink } from 'react-icons/hi';

const LaborTab = ({
  user,
  onSuccessMessage,
  onErrorLaborMessage,
  isActive,
  deutschlandmodusBeta,
  setDeutschlandmodusBeta,
  groupsBeta,
  setGroupsBeta,
  databaseBeta,
  setDatabaseBeta,
  customGeneratorsBeta,
  setCustomGeneratorsBeta,
  sharepicBeta,
  setSharepicBeta,
  anweisungenBeta,
  setAnweisungenBeta,
  youBeta,
  setYouBeta,
  collabBeta,
  setCollabBeta,
  isAdmin = false,
  adminOnlyFeatures = [],
  availableFeatures = []
}) => {
  const BETA_VIEWS = {
    DEUTSCHLANDMODUS: 'deutschlandmodus',
    GROUPS: 'groups',
    DATABASE: 'database',
    GENERATORS: 'customGenerators',
    SHAREPIC: 'sharepic',
    ANWEISUNGEN: 'anweisungen',
    YOU: 'you',
    COLLAB: 'collab',
  };

  const [currentView, setCurrentView] = useState('deutschlandmodus');

  // Set default view to first available feature if current is not available
  useEffect(() => {
    if (availableFeatures.length > 0 && !availableFeatures.find(f => f.key === currentView)) {
      setCurrentView(availableFeatures[0].key);
    }
  }, [availableFeatures, currentView]);

  const handleViewChange = (view) => {
    setCurrentView(view);
  };

  const handleBetaToggle = (setter, currentValue, featureName) => {
    const newValue = !currentValue;
    setter(newValue);
    onSuccessMessage(`${featureName} Beta-Test ${newValue ? 'aktiviert' : 'deaktiviert'}.`);
    onErrorLaborMessage('');
  };

  const renderNavigationPanel = () => (
    <div className="groups-vertical-navigation"> 
      {availableFeatures.map((feature) => (
        <button
          key={feature.key}
          className={`groups-vertical-tab ${currentView === feature.key ? 'active' : ''}`}
          onClick={() => handleViewChange(feature.key)}
        >
          {feature.label}
          {feature.isAdminOnly && <span className="admin-badge"> (Admin)</span>}
        </button>
      ))}
    </div>
  );

  const renderContentPanel = () => {
    let content = null;
    switch (currentView) {
      case BETA_VIEWS.DEUTSCHLANDMODUS:
        content = (
          <div className="labor-tab-checkbox-container">
            <StyledCheckbox
              id="deutschlandmodus-beta"
              label="Deutschlandmodus aktivieren"
              checked={deutschlandmodusBeta}
              onChange={() => handleBetaToggle(setDeutschlandmodusBeta, deutschlandmodusBeta, 'Deutschlandmodus')}
              aria-label="Deutschlandmodus Beta-Test aktivieren"
            />
          </div>
        );
        break;
      case BETA_VIEWS.GROUPS:
        content = (
          <div className="labor-tab-checkbox-container">
            <StyledCheckbox
              id="groups-beta"
              label="Gruppen-Tab anzeigen und Funktionalität aktivieren"
              checked={groupsBeta}
              onChange={() => handleBetaToggle(setGroupsBeta, groupsBeta, 'Gruppen')}
              aria-label="Gruppen Beta-Test aktivieren"
            />
          </div>
        );
        break;
      case BETA_VIEWS.DATABASE:
        content = (
          <>
            <div className="labor-tab-checkbox-container">
              <StyledCheckbox
                id="database-beta"
                label="'Texte & Vorlagen'-Tab (Datenbank) anzeigen und Funktionalität aktivieren"
                checked={databaseBeta}
                onChange={() => handleBetaToggle(setDatabaseBeta, databaseBeta, 'Datenbank')}
                aria-label="Datenbank Beta-Test aktivieren"
              />
            </div>
            {databaseBeta && (
              <Link to="/datenbank" className="profile-action-button profile-secondary-button labor-tab-external-link">
                Zur Datenbank <HiOutlineExternalLink className="labor-tab-external-link-icon"/>
              </Link>
            )}
          </>
        );
        break;
      case BETA_VIEWS.GENERATORS:
        content = (
          <div className="labor-tab-checkbox-container">
            <StyledCheckbox
              id="custom-generators-beta"
              label="'Meine Grüneratoren'-Tab anzeigen und Funktionalität aktivieren"
              checked={customGeneratorsBeta}
              onChange={() => handleBetaToggle(setCustomGeneratorsBeta, customGeneratorsBeta, 'Grüneratoren')}
              aria-label="Eigene Grüneratoren Beta-Test aktivieren"
            />
          </div>
        );
        break;
      case BETA_VIEWS.SHAREPIC:
        content = (
          <>
            <div className="labor-tab-checkbox-container">
              <StyledCheckbox
                id="sharepic-beta"
                label="Link zum Sharepic-Grünerator anzeigen"
                checked={sharepicBeta}
                onChange={() => handleBetaToggle(setSharepicBeta, sharepicBeta, 'Sharepic Link')}
                aria-label="Sharepic Link Beta-Test aktivieren"
              />
            </div>
            {sharepicBeta && (
              <Link to="/sharepic" className="profile-action-button profile-secondary-button labor-tab-external-link">
                Zum Sharepic Grünerator <HiOutlineExternalLink className="labor-tab-external-link-icon"/>
              </Link>
            )}
          </>
        );
        break;
      case BETA_VIEWS.ANWEISUNGEN:
        content = (
          <div className="labor-tab-checkbox-container">
            <StyledCheckbox
              id="anweisungen-beta"
              label="'Anweisungen & Wissen'-Tab anzeigen und Funktionalität aktivieren"
              checked={anweisungenBeta}
              onChange={() => handleBetaToggle(setAnweisungenBeta, anweisungenBeta, 'Anweisungen & Wissen')}
              aria-label="Anweisungen & Wissen Beta-Test aktivieren"
            />
          </div>
        );
        break;
      case BETA_VIEWS.YOU:
        content = (
          <>
            <div className="labor-tab-checkbox-container">
              <StyledCheckbox
                id="you-beta"
                label="You Grünerator aktivieren"
                checked={youBeta}
                onChange={() => handleBetaToggle(setYouBeta, youBeta, 'You Generator')}
                aria-label="You Grünerator Beta-Test aktivieren"
              />
            </div>
            {youBeta && (
              <Link to="/you" className="profile-action-button profile-secondary-button labor-tab-external-link">
                Zum You Grünerator <HiOutlineExternalLink className="labor-tab-external-link-icon"/>
              </Link>
            )}
          </>
        );
        break;
      case BETA_VIEWS.COLLAB:
        content = (
          <div className="labor-tab-checkbox-container">
            <StyledCheckbox
              id="collab-beta"
              label="Kollaborative Bearbeitung aktivieren"
              checked={collabBeta}
              onChange={() => handleBetaToggle(setCollabBeta, collabBeta, 'Kollaborative Bearbeitung')}
              aria-label="Kollaborative Bearbeitung Beta-Test aktivieren"
            />
          </div>
        );
        break;
      default:
        content = <p>Bitte wähle einen Beta-Test aus.</p>;
    }

    return (
      <motion.div
        key={currentView}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        transition={{ duration: 0.2 }}
        className="profile-form-section"
      >
        <div className="form-group">
          <div className="form-group-title labor-tab-title">{currentView.replace('_',' ')} Einstellungen</div>
          <p className="labor-tab-help-text">
            Aktiviere oder deaktiviere hier einzelne Beta-Funktionen. Änderungen werden sofort wirksam.
          </p>
          {content}
        </div>
        {!isAdmin && availableFeatures.some(f => f.isAdminOnly) && (
          <div className="labor-tab-admin-notice">
            <p><strong>Hinweis:</strong> Einige Beta-Features sind nur für Administratoren verfügbar.</p>
          </div>
        )}
      </motion.div>
    );
  };

  if (!isActive) {
    return null;
  }

  return (
    <motion.div 
      className="profile-content groups-management-layout"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
    > 
      <div className="groups-navigation-panel">
        {renderNavigationPanel()}
      </div>
      <div className="groups-content-panel">
        <AnimatePresence mode="wait">
          {renderContentPanel()}
        </AnimatePresence>
      </div>
    </motion.div>
  );
};

export default LaborTab; 