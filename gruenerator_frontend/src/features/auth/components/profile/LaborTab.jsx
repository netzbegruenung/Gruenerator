import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from "motion/react";
import FeatureToggle from '../../../../components/common/FeatureToggle';
import { HiOutlineExternalLink, HiOutlineGlobe, HiOutlineUserGroup, HiOutlineDatabase, HiOutlineCog, HiOutlinePhotograph, HiOutlineAcademicCap, HiOutlineUser, HiOutlineUsers, HiChatAlt2 } from 'react-icons/hi';
import { useBetaFeatures } from '../../../../hooks/useBetaFeatures';

const LaborTab = ({
  user,
  onSuccessMessage,
  onErrorLaborMessage,
  isActive,
}) => {
  const { 
    getBetaFeatureState, 
    updateUserBetaFeatures, 
    getAvailableFeatures, 
    isAdmin 
  } = useBetaFeatures();
  const BETA_VIEWS = {
    GROUPS: 'groups',
    DATABASE: 'database',
    GENERATORS: 'customGenerators',
    ANWEISUNGEN: 'anweisungen',
    YOU: 'you',
    COLLAB: 'collab',
    QA: 'qa',
  };

  const handleBetaToggle = (setter, currentValue, featureName) => {
    const newValue = !currentValue;
    setter(newValue);
    onSuccessMessage(`${featureName} Beta-Test ${newValue ? 'aktiviert' : 'deaktiviert'}.`);
    onErrorLaborMessage('');
  };

  const getBetaFeatureConfig = (viewKey) => {
    switch (viewKey) {
      case BETA_VIEWS.GROUPS:
        return {
          title: 'Gruppen-Verwaltung',
          description: 'Verwalte deine Gruppen und arbeite gemeinsam an Projekten.',
          checked: getBetaFeatureState('groups'),
          setter: (value) => updateUserBetaFeatures('groups', value),
          featureName: 'Gruppen',
          checkboxLabel: 'Gruppen-Tab anzeigen und Funktionalität aktivieren',
          icon: HiOutlineUserGroup
        };
      case BETA_VIEWS.DATABASE:
        return {
          title: 'Texte & Vorlagen',
          description: 'Zugang zur Datenbank mit Texten und Vorlagen für deine Arbeit.',
          checked: getBetaFeatureState('database'),
          setter: (value) => updateUserBetaFeatures('database', value),
          featureName: 'Datenbank',
          checkboxLabel: '\'Texte & Vorlagen\'-Tab (Datenbank) anzeigen und Funktionalität aktivieren',
          linkTo: '/datenbank',
          linkText: 'Zur Datenbank',
          icon: HiOutlineDatabase
        };
      case BETA_VIEWS.GENERATORS:
        return {
          title: 'Meine Grüneratoren',
          description: 'Erstelle und verwalte deine eigenen benutzerdefinierten Grüneratoren.',
          checked: getBetaFeatureState('customGenerators'),
          setter: (value) => updateUserBetaFeatures('customGenerators', value),
          featureName: 'Grüneratoren',
          checkboxLabel: '\'Meine Grüneratoren\'-Tab anzeigen und Funktionalität activieren',
          icon: HiOutlineCog
        };
      case BETA_VIEWS.ANWEISUNGEN:
        return {
          title: 'Profil auswählen',
          description: 'Verwalte persönliche Anweisungen und Wissensbausteine für die KI.',
          checked: getBetaFeatureState('anweisungen'),
          setter: (value) => updateUserBetaFeatures('anweisungen', value),
          featureName: 'Profil auswählen',
          checkboxLabel: '\'Profil auswählen\'-Tab anzeigen und Funktionalität aktivieren',
          icon: HiOutlineAcademicCap
        };
      case BETA_VIEWS.YOU:
        return {
          title: 'You Grünerator',
          description: 'Personalisierte Inhalte basierend auf deinem Profil und deinen Vorlieben.',
          checked: getBetaFeatureState('you'),
          setter: (value) => updateUserBetaFeatures('you', value),
          featureName: 'You Generator',
          checkboxLabel: 'You Grünerator aktivieren',
          linkTo: '/you',
          linkText: 'Zum You Grünerator',
          icon: HiOutlineUser
        };
      case BETA_VIEWS.COLLAB:
        return {
          title: 'Kollaborative Bearbeitung',
          description: 'Arbeite in Echtzeit mit anderen an Dokumenten und Texten.',
          checked: getBetaFeatureState('collab'),
          setter: (value) => updateUserBetaFeatures('collab', value),
          featureName: 'Kollaborative Bearbeitung',
          checkboxLabel: 'Kollaborative Bearbeitung aktivieren',
          icon: HiOutlineUsers
        };
      case BETA_VIEWS.QA:
        return {
          title: 'Q&A Sammlungen',
          description: 'Erstelle intelligente Fragesysteme basierend auf deinen Dokumenten für natürliche Gespräche.',
          checked: getBetaFeatureState('qa'),
          setter: (value) => updateUserBetaFeatures('qa', value),
          featureName: 'Q&A Sammlungen',
          checkboxLabel: 'Q&A-Tab in Meine Inhalte anzeigen und Funktionalität aktivieren',
          icon: HiChatAlt2
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
            {getAvailableFeatures().map(feature => {
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
                    
                    <div className="labor-tab-toggle-container">
                      <FeatureToggle
                        isActive={config.checked}
                        onToggle={(checked) => {
                          config.setter(checked);
                          onSuccessMessage(`${config.featureName} Beta-Test ${checked ? 'aktiviert' : 'deaktiviert'}.`);
                          onErrorLaborMessage('');
                        }}
                        label={config.checkboxLabel}
                        icon={config.icon}
                        description={config.description}
                        className="labor-feature-toggle"
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

          {!isAdmin && getAvailableFeatures().some(f => f.isAdminOnly) && (
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