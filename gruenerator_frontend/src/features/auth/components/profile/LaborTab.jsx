import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import Spinner from '../../../../components/common/Spinner';
import ProfileTabSkeleton from '../../../../components/common/UI/ProfileTabSkeleton';
import { motion, AnimatePresence } from "motion/react";
import StyledCheckbox from '../../../../components/common/AnimatedCheckbox';
import { HiOutlineExternalLink } from 'react-icons/hi';
import { templatesSupabase } from '../../../../components/utils/templatesSupabaseClient';

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
}) => {
  const [currentView, setCurrentView] = useState('deutschlandmodus');
  const [loading, setLoading] = useState(false);
  const [availableFeatures, setAvailableFeatures] = useState([]);
  const [checkingFeatures, setCheckingFeatures] = useState(true);

  const BETA_VIEWS = {
    DEUTSCHLANDMODUS: 'deutschlandmodus',
    GROUPS: 'groups',
    DATABASE: 'database',
    GENERATORS: 'generators',
    SHAREPIC: 'sharepic',
    ANWEISUNGEN: 'anweisungen',
    YOU: 'you',
  };

  const ALL_FEATURES = [
    { key: BETA_VIEWS.DEUTSCHLANDMODUS, label: 'Deutschlandmodus' },
    { key: BETA_VIEWS.SHAREPIC, label: 'Sharepic' },
    { key: BETA_VIEWS.GROUPS, label: 'Gruppen' },
    { key: BETA_VIEWS.DATABASE, label: 'Datenbank' },
    { key: BETA_VIEWS.GENERATORS, label: 'Grüneratoren' },
    { key: BETA_VIEWS.ANWEISUNGEN, label: 'Anweisungen & Wissen' },
    { key: BETA_VIEWS.YOU, label: 'You Generator' },
  ];

  // Check which features are available for current user
  useEffect(() => {
    const checkAvailableFeatures = async () => {
      try {
        const accessPromises = ALL_FEATURES.map(async (feature) => {
          const { data, error } = await templatesSupabase
            .rpc('can_access_beta_feature', { feature_name: feature.key });
          
          if (error) throw error;
          return { ...feature, hasAccess: data };
        });

        const results = await Promise.all(accessPromises);
        const accessible = results.filter(f => f.hasAccess);
        setAvailableFeatures(accessible);

        // Set default view to first available feature
        if (accessible.length > 0 && !accessible.find(f => f.key === currentView)) {
          setCurrentView(accessible[0].key);
        }
      } catch (error) {
        console.error('Error checking feature access:', error);
        // Fallback to basic features if check fails
        setAvailableFeatures([
          { key: BETA_VIEWS.DEUTSCHLANDMODUS, label: 'Deutschlandmodus' },
          { key: BETA_VIEWS.SHAREPIC, label: 'Sharepic' }
        ]);
      } finally {
        setCheckingFeatures(false);
      }
    };

    if (isActive) {
      checkAvailableFeatures();
    }
  }, [isActive, currentView]);

  // Auto-deactivate features that are no longer available
  useEffect(() => {
    if (!checkingFeatures && availableFeatures.length > 0) {
      const availableFeatureKeys = availableFeatures.map(f => f.key);
      const featureMappings = [
        { key: BETA_VIEWS.DEUTSCHLANDMODUS, isActive: deutschlandmodusBeta, setter: setDeutschlandmodusBeta, name: 'Deutschlandmodus' },
        { key: BETA_VIEWS.GROUPS, isActive: groupsBeta, setter: setGroupsBeta, name: 'Gruppen' },
        { key: BETA_VIEWS.DATABASE, isActive: databaseBeta, setter: setDatabaseBeta, name: 'Datenbank' },
        { key: BETA_VIEWS.GENERATORS, isActive: customGeneratorsBeta, setter: setCustomGeneratorsBeta, name: 'Grüneratoren' },
        { key: BETA_VIEWS.SHAREPIC, isActive: sharepicBeta, setter: setSharepicBeta, name: 'Sharepic' },
        { key: BETA_VIEWS.ANWEISUNGEN, isActive: anweisungenBeta, setter: setAnweisungenBeta, name: 'Anweisungen & Wissen' },
        { key: BETA_VIEWS.YOU, isActive: youBeta, setter: setYouBeta, name: 'You Generator' },
      ];

      const deactivatedFeatures = [];
      featureMappings.forEach(({ key, isActive, setter, name }) => {
        if (isActive && !availableFeatureKeys.includes(key)) {
          setter(false);
          deactivatedFeatures.push(name);
        }
      });

      if (deactivatedFeatures.length > 0) {
        onSuccessMessage(`Nicht verfügbare Features automatisch deaktiviert: ${deactivatedFeatures.join(', ')}`);
      }
    }
  }, [availableFeatures, checkingFeatures, deutschlandmodusBeta, groupsBeta, databaseBeta, customGeneratorsBeta, sharepicBeta, anweisungenBeta, youBeta]);

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
        </button>
      ))}
    </div>
  );

  const renderContentPanel = () => {
    if (loading || checkingFeatures) {
      return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
          <ProfileTabSkeleton type="form" itemCount={1} />
        </motion.div>
      );
    }

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
          <p className="help-text labor-tab-help-text">
            Aktiviere oder deaktiviere hier einzelne Beta-Funktionen. Änderungen werden sofort wirksam.
          </p>
          {content}
        </div>
      </motion.div>
    );
  };

  if (!isActive) {
    return null;
  }

  return (
    <div className="profile-content groups-management-layout"> 
      <div className="groups-navigation-panel">
        {renderNavigationPanel()}
      </div>
      <div className="groups-content-panel">
        <AnimatePresence mode="wait">
          {renderContentPanel()}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default LaborTab; 