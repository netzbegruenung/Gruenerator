import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from "motion/react";
import FeatureToggle from '../../../../components/common/FeatureToggle';
import { HiOutlineExternalLink, HiOutlineGlobe, HiOutlineUserGroup, HiOutlineDatabase, HiOutlineCog, HiOutlinePhotograph, HiOutlineAcademicCap, HiOutlineUser, HiOutlineUsers, HiOutlineOfficeBuilding, HiChip } from 'react-icons/hi';
import { NotebookIcon } from '../../../../config/icons';
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
    DATABASE: 'database',
    GENERATORS: 'customGenerators',
    YOU: 'you',
    COLLAB: 'collab',
    GROUPS: 'groups',
    QA: 'qa',
    ELEARNING: 'e_learning',
    BUNDESTAG_API: 'bundestag_api_enabled',
    MEMORY: 'memory',
    CANVA: 'canva',
  };

  const handleBetaToggle = (setter, currentValue, featureName) => {
    const newValue = !currentValue;
    setter(newValue);
    onSuccessMessage(`${featureName} Beta-Test ${newValue ? 'aktiviert' : 'deaktiviert'}.`);
    onErrorLaborMessage('');
  };

  const getBetaFeatureConfig = (viewKey) => {
    switch (viewKey) {
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
      case BETA_VIEWS.GROUPS:
        return {
          title: 'Gruppen',
          description: 'Verwalte und organisiere deine Arbeit in Gruppen für bessere Zusammenarbeit.',
          checked: getBetaFeatureState('groups'),
          setter: (value) => updateUserBetaFeatures('groups', value),
          featureName: 'Gruppen',
          checkboxLabel: 'Gruppen-Tab anzeigen und Funktionalität aktivieren',
          icon: HiOutlineUserGroup
        };
      case BETA_VIEWS.QA:
        return {
          title: 'Q&A Sammlungen',
          description: 'Erstelle intelligente Fragesysteme basierend auf deinen Dokumenten für natürliche Gespräche.',
          checked: getBetaFeatureState('qa'),
          setter: (value) => updateUserBetaFeatures('qa', value),
          featureName: 'Q&A Sammlungen',
          checkboxLabel: 'Q&A-Tab in Texte & Grafik anzeigen und Funktionalität aktivieren',
          icon: NotebookIcon
        };
      case BETA_VIEWS.ELEARNING:
        return {
          title: 'E-Learning',
          description: 'Interaktive E-Learning Module über grüne Politik, Klimaschutz und nachhaltiges Engagement. Erweitere dein Wissen mit strukturierten Lernpfaden.',
          checked: getBetaFeatureState('e_learning'),
          setter: (value) => updateUserBetaFeatures('e_learning', value),
          featureName: 'E-Learning',
          checkboxLabel: 'E-Learning Module aktivieren',
          linkTo: '/e-learning',
          linkText: 'Zu den Lernmodulen',
          icon: HiOutlineAcademicCap
        };
      case BETA_VIEWS.BUNDESTAG_API:
        return {
          title: 'Bundestag API',
          description: 'Integration mit der Bundestag API (DIP - Dokumentations- und Informationssystem für Parlamentsmaterialien) um parlamentarische Dokumente, Drucksachen und Plenarprotokolle in deine Anträge einzubeziehen.',
          checked: getBetaFeatureState('bundestag_api_enabled'),
          setter: (value) => updateUserBetaFeatures('bundestag_api_enabled', value),
          featureName: 'Bundestag API',
          checkboxLabel: 'Bundestag API für parlamentarische Dokumente aktivieren',
          linkTo: '/bundestag',
          linkText: 'Zum Bundestag-Suchportal',
          icon: HiOutlineOfficeBuilding
        };
      case BETA_VIEWS.MEMORY:
        return {
          title: 'Memory (Mem0ry)',
          description: 'Personalisierte KI-Memories, die sich wichtige Informationen über dich merken und bei der Texterstellung berücksichtigen. Aktiviere diese Funktion, um individualisierte Inhalte zu erhalten.',
          checked: getBetaFeatureState('memory'),
          setter: (value) => updateUserBetaFeatures('memory', value),
          featureName: 'Memory',
          checkboxLabel: 'Memory-Tab in der Intelligenz-Sektion aktivieren',
          icon: HiChip
        };
      case BETA_VIEWS.CANVA:
        return {
          title: 'Canva Integration',
          description: 'Erweiterte Canva-Integration mit Zugriff auf deine Designs, Vorlagen und Assets. Synchronisiere deine Canva-Inhalte und nutze sie direkt in der Grünerator-Plattform.',
          checked: getBetaFeatureState('canva'),
          setter: (value) => updateUserBetaFeatures('canva', value),
          featureName: 'Canva Integration',
          checkboxLabel: 'Canva-Tab in Texte & Grafik anzeigen und Funktionalität aktivieren',
          icon: HiOutlinePhotograph
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
            {getAvailableFeatures().filter(f => f.key !== 'database').map(feature => {
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
