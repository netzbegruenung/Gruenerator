import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from "motion/react";
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

  const handleBetaToggle = (setter, currentValue, featureName) => {
    const newValue = !currentValue;
    setter(newValue);
    onSuccessMessage(`${featureName} Beta-Test ${newValue ? 'aktiviert' : 'deaktiviert'}.`);
    onErrorLaborMessage('');
  };

  const getBetaFeatureConfig = (viewKey) => {
    switch (viewKey) {
      case BETA_VIEWS.DEUTSCHLANDMODUS:
        return {
          title: 'Deutschlandmodus',
          description: 'Aktiviere spezielle Funktionen für Deutschland-spezifische Inhalte.',
          checked: deutschlandmodusBeta,
          setter: setDeutschlandmodusBeta,
          featureName: 'Deutschlandmodus',
          checkboxLabel: 'Deutschlandmodus aktivieren'
        };
      case BETA_VIEWS.GROUPS:
        return {
          title: 'Gruppen-Verwaltung',
          description: 'Verwalte deine Gruppen und arbeite gemeinsam an Projekten.',
          checked: groupsBeta,
          setter: setGroupsBeta,
          featureName: 'Gruppen',
          checkboxLabel: 'Gruppen-Tab anzeigen und Funktionalität aktivieren'
        };
      case BETA_VIEWS.DATABASE:
        return {
          title: 'Texte & Vorlagen',
          description: 'Zugang zur Datenbank mit Texten und Vorlagen für deine Arbeit.',
          checked: databaseBeta,
          setter: setDatabaseBeta,
          featureName: 'Datenbank',
          checkboxLabel: '\'Texte & Vorlagen\'-Tab (Datenbank) anzeigen und Funktionalität aktivieren',
          linkTo: '/datenbank',
          linkText: 'Zur Datenbank'
        };
      case BETA_VIEWS.GENERATORS:
        return {
          title: 'Meine Grüneratoren',
          description: 'Erstelle und verwalte deine eigenen benutzerdefinierten Grüneratoren.',
          checked: customGeneratorsBeta,
          setter: setCustomGeneratorsBeta,
          featureName: 'Grüneratoren',
          checkboxLabel: '\'Meine Grüneratoren\'-Tab anzeigen und Funktionalität activieren'
        };
      case BETA_VIEWS.SHAREPIC:
        return {
          title: 'Sharepic-Grünerator',
          description: 'Erstelle ansprechende Sharepics für deine Social Media Kanäle.',
          checked: sharepicBeta,
          setter: setSharepicBeta,
          featureName: 'Sharepic Link',
          checkboxLabel: 'Link zum Sharepic-Grünerator anzeigen',
          linkTo: '/sharepic',
          linkText: 'Zum Sharepic Grünerator'
        };
      case BETA_VIEWS.ANWEISUNGEN:
        return {
          title: 'Anweisungen & Wissen',
          description: 'Verwalte persönliche Anweisungen und Wissensbausteine für die KI.',
          checked: anweisungenBeta,
          setter: setAnweisungenBeta,
          featureName: 'Anweisungen & Wissen',
          checkboxLabel: '\'Anweisungen & Wissen\'-Tab anzeigen und Funktionalität aktivieren'
        };
      case BETA_VIEWS.YOU:
        return {
          title: 'You Grünerator',
          description: 'Personalisierte Inhalte basierend auf deinem Profil und deinen Vorlieben.',
          checked: youBeta,
          setter: setYouBeta,
          featureName: 'You Generator',
          checkboxLabel: 'You Grünerator aktivieren',
          linkTo: '/you',
          linkText: 'Zum You Grünerator'
        };
      case BETA_VIEWS.COLLAB:
        return {
          title: 'Kollaborative Bearbeitung',
          description: 'Arbeite in Echtzeit mit anderen an Dokumenten und Texten.',
          checked: collabBeta,
          setter: setCollabBeta,
          featureName: 'Kollaborative Bearbeitung',
          checkboxLabel: 'Kollaborative Bearbeitung aktivieren'
        };
      default:
        return null;
    }
  };

  if (!isActive) {
    return null;
  }

  return (
    <motion.div 
      className="profile-content"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
    >
      <div className="profile-form-section">
        <div className="auth-form">
          <div className="profile-cards-grid">
            {availableFeatures.map(feature => {
              const config = getBetaFeatureConfig(feature.key);
              if (!config) return null;

              return (
                <div key={feature.key} className="profile-card">
                  <div className="profile-card-header">
                    <h3>{config.title}</h3>
                    {feature.isAdminOnly && <span className="admin-badge">Admin</span>}
                  </div>
                  <div className="profile-card-content">
                    <p className="group-description">
                      {config.description}
                    </p>
                    
                    <div className="labor-tab-checkbox-container">
                      <StyledCheckbox
                        id={`${feature.key}-beta`}
                        label={config.checkboxLabel}
                        checked={config.checked}
                        onChange={() => handleBetaToggle(config.setter, config.checked, config.featureName)}
                        aria-label={`${config.featureName} Beta-Test aktivieren`}
                      />
                    </div>

                    {config.linkTo && config.checked && (
                      <Link 
                        to={config.linkTo} 
                        className="profile-action-button profile-secondary-button labor-tab-external-link"
                      >
                        {config.linkText} <HiOutlineExternalLink className="labor-tab-external-link-icon"/>
                      </Link>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {!isAdmin && availableFeatures.some(f => f.isAdminOnly) && (
            <div className="profile-card" style={{marginTop: 'var(--spacing-large)'}}>
              <div className="profile-card-header">
                <h3>Administrator-Features</h3>
              </div>
              <div className="profile-card-content">
                <p><strong>Hinweis:</strong> Einige Beta-Features sind nur für Administratoren verfügbar.</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
};

export default LaborTab; 