import React, { useState, useEffect } from 'react';
import CanvaTemplatesTab from './CanvaTemplatesTab';
import AntraegeListTab from './AntraegeListTab';
import PRTextsManagementTab from './PRTextsManagementTab';
import ProfileTabSkeleton from '../../../../components/common/UI/ProfileTabSkeleton';
import { motion, AnimatePresence } from "motion/react";

// Importiere Icons, falls gewünscht für die Navigation
// import { HiOutlineDocumentText, HiOutlinePhotograph, HiOutlineNewspaper } from 'react-icons/hi'; // Example for new icon

const TexteVorlagenTab = ({ user, templatesSupabase, onSuccessMessage, onErrorMessage, isActive }) => {
  const [currentView, setCurrentView] = useState('canva'); // 'canva', 'antraege', oder 'pr_texts'
  const [loading, setLoading] = useState(true);

  // Simuliere einen kurzen Ladevorgang, um den Skeleton zu zeigen
  useEffect(() => {
    if (isActive) {
      setLoading(true);
      const timer = setTimeout(() => {
        setLoading(false);
      }, 600);
      return () => clearTimeout(timer);
    }
  }, [isActive, currentView]);

  const VIEWS = {
    CANVA: 'canva',
    ANTRAEGE: 'antraege',
    PR_TEXTS: 'pr_texts', // New view state
  };

  const handleViewChange = (view) => {
    setLoading(true);
    setCurrentView(view);
  };

  const renderNavigationPanel = () => (
    <div className="groups-vertical-navigation"> {/* Wiederverwendung der Gruppen-Styling-Klasse oder eigene */}
      <button
        className={`groups-vertical-tab ${currentView === VIEWS.CANVA ? 'active' : ''}`}
        onClick={() => handleViewChange(VIEWS.CANVA)}
      >
        {/* <HiOutlinePhotograph className="tab-icon" /> Optionales Icon */}
        Canva-Vorlagen
      </button>
      <button
        className={`groups-vertical-tab ${currentView === VIEWS.ANTRAEGE ? 'active' : ''}`}
        onClick={() => handleViewChange(VIEWS.ANTRAEGE)}
      >
        {/* <HiOutlineDocumentText className="tab-icon" /> Optionales Icon */}
        Anträge
      </button>
      <button
        className={`groups-vertical-tab ${currentView === VIEWS.PR_TEXTS ? 'active' : ''}`}
        onClick={() => handleViewChange(VIEWS.PR_TEXTS)}
      >
        {/* <HiOutlineNewspaper className="tab-icon" /> Optionales Icon */}
        PR-Texte
      </button>
    </div>
  );

  const renderContentPanel = () => {
    if (!user || !templatesSupabase) {
      return (
        <div className="profile-content-loading">
          <ProfileTabSkeleton type="default" itemCount={3} />
        </div>
      );
    }

    // Wenn Laden, zeige den Skeleton
    if (loading) {
      return (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <div className="profile-avatar-section">
            <ProfileTabSkeleton type="default" itemCount={1} />
          </div>
          <div className="form-group">
            <div className="form-group-title">
              <div className="profile-skeleton-title"></div>
            </div>
            <ProfileTabSkeleton 
              type={currentView === VIEWS.CANVA || currentView === VIEWS.ANTRAEGE ? "list" : "form"} 
              itemCount={3} 
            />
          </div>
        </motion.div>
      );
    }

    switch (currentView) {
      case VIEWS.CANVA:
        return (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
          >
            <div className="profile-avatar-section"> {/* Für konsistentes Layout */}
              <p>Verwalte hier deine persönlichen Canva-Vorlagen. Du kannst neue Vorlagen hinzufügen, bestehende bearbeiten oder nicht mehr benötigte löschen.</p>
            </div>
            <div className="form-group"> {/* Standard Form-Gruppierung */}
              <div className="form-group-title">Meine Canva-Vorlagen</div>
              <CanvaTemplatesTab
                user={user}
                templatesSupabase={templatesSupabase}
                onSuccessMessage={onSuccessMessage}
                onErrorMessage={onErrorMessage}
                isActive={isActive && currentView === VIEWS.CANVA}
                // isEmbedded={true} // Prop, um interne Titel/Layouts zu steuern, falls noch nötig
              />
            </div>
          </motion.div>
        );
      case VIEWS.ANTRAEGE:
        return (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
          >
            <div className="profile-avatar-section">  {/* Für konsistentes Layout */}
              <p>Hier siehst du deine gespeicherten Anträge und kannst sie verwalten.</p>
            </div>
            <div className="form-group"> {/* Standard Form-Gruppierung */}
              <div className="form-group-title">Meine Anträge</div>
              <AntraegeListTab
                user={user}
                templatesSupabase={templatesSupabase}
                onSuccessMessage={onSuccessMessage}
                onErrorAntraegeMessage={onErrorMessage} // Sicherstellen, dass Prop-Namen übereinstimmen
                isActive={isActive && currentView === VIEWS.ANTRAEGE}
                // isEmbedded={true} // Prop, um interne Titel/Layouts zu steuern, falls noch nötig
              />
            </div>
          </motion.div>
        );
      case VIEWS.PR_TEXTS: // New case for PR Texts
        return (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
          >
            <div className="profile-avatar-section">
              <p>Verwalte hier deine Texte für die Öffentlichkeitsarbeit. Du kannst neue Texte erstellen, bestehende bearbeiten oder löschen.</p>
            </div>
            <div className="form-group">
              <div className="form-group-title">Meine PR-Texte</div>
              <PRTextsManagementTab
                user={user}
                templatesSupabase={templatesSupabase}
                onSuccessMessage={onSuccessMessage}
                onErrorMessage={onErrorMessage}
                isActive={isActive && currentView === VIEWS.PR_TEXTS}
              />
            </div>
          </motion.div>
        );
      default:
        return <p>Bitte wähle eine Ansicht.</p>;
    }
  };

  return (
    <div className="profile-content groups-management-layout"> {/* Wiederverwendung der Layout-Klasse */}
      <div className="groups-navigation-panel">
        {renderNavigationPanel()}
      </div>
      <div className="groups-content-panel profile-form-section"> {/* Stellt sicher, dass der rechte Teil das Styling von profile-form-section erhält */}
        <AnimatePresence mode="wait">
          {renderContentPanel()}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default TexteVorlagenTab; 