import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { HiOutlineAcademicCap, HiOutlineLightBulb, HiOutlineInformationCircle } from 'react-icons/hi';
import { useBetaFeatures } from '../../../hooks/useBetaFeatures';
import { useOptimizedAuth } from '../../../hooks/useAuth';

// E-Learning Feature CSS - Loaded only when this feature is accessed
import '../styles/elearning.css';

const ELearningPage = () => {
  const { user, isAuthenticated } = useOptimizedAuth();
  const { getBetaFeatureState } = useBetaFeatures();
  const [hasAccess, setHasAccess] = useState(false);

  useEffect(() => {
    if (isAuthenticated && user) {
      const elearningEnabled = getBetaFeatureState('e_learning');
      setHasAccess(elearningEnabled);
    }
  }, [isAuthenticated, user, getBetaFeatureState]);


  if (!isAuthenticated) {
    return (
      <div className="elearning-access-denied">
        <div className="access-denied-content">
          <HiOutlineInformationCircle className="access-denied-icon" />
          <h2>Anmeldung erforderlich</h2>
          <p>Bitte melde dich an, um auf die E-Learning Inhalte zugreifen zu können.</p>
        </div>
      </div>
    );
  }

  if (!hasAccess) {
    return (
      <div className="elearning-access-denied">
        <div className="access-denied-content">
          <HiOutlineAcademicCap className="access-denied-icon" />
          <h2>E-Learning Zugang erforderlich</h2>
          <p>Das E-Learning Feature ist derzeit als Beta-Version verfügbar.</p>
          <p>Du kannst es in deinen <a href="/profile">Profileinstellungen</a> aktivieren.</p>
        </div>
      </div>
    );
  }

  return (
    <motion.div 
      className="elearning-page"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
    >
      <div className="elearning-header">
        <div className="elearning-header-content">
          <motion.div 
            className="elearning-title-section"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
          >
            <div className="elearning-icon">
              <HiOutlineAcademicCap />
            </div>
            <h1 className="elearning-title">E-Learning</h1>
            <p className="elearning-subtitle">
              Erweitere dein Wissen zu grüner Politik und nachhaltiger Entwicklung
            </p>
          </motion.div>

          <motion.div 
            className="elearning-intro"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            <div className="intro-card">
              <HiOutlineLightBulb className="intro-icon" />
              <div className="intro-content">
                <h3>Willkommen im Grünerator E-Learning!</h3>
                <p>
                  Entdecke interaktive Lernmodule zu wichtigen Themen der grünen Politik. 
                  Jedes Kapitel kombiniert fundiertes Wissen mit praktischen Anwendungen 
                  für dein politisches Engagement.
                </p>
              </div>
            </div>
          </motion.div>
        </div>
      </div>

      <div className="elearning-content">
        <motion.section 
          className="overview-section"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.3 }}
        >
          <div className="section-header">
            <h2>E-Learning Übersicht</h2>
            <p>Interaktive Lernmodule für grüne Politik und nachhaltige Entwicklung</p>
          </div>

          <div className="overview-content">
            <div className="overview-card">
              <h3>Was ist E-Learning im Grünerator?</h3>
              <p>
                Das E-Learning Feature bietet dir strukturierte Lernmodule zu wichtigen Themen 
                der grünen Politik und nachhaltigen Entwicklung. Hier kannst du dein Wissen 
                erweitern und praktische Fähigkeiten für dein politisches Engagement entwickeln.
              </p>
            </div>
          </div>
        </motion.section>

        <motion.section 
          className="elearning-info"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.5 }}
        >
          <div className="info-card">
            <h3>Über das E-Learning</h3>
            <ul>
              <li>✅ Strukturierte Lernmodule zu grüner Politik</li>
              <li>✅ Praktische Anwendungen für politisches Engagement</li>
              <li>✅ Fundierte Informationen von Expert:innen</li>
              <li>🔨 Interaktive Inhalte (in Entwicklung)</li>
              <li>🔨 Progress-Tracking und Zertifikate (geplant)</li>
              <li>🔨 Community-Features und Diskussionen (geplant)</li>
            </ul>
          </div>
        </motion.section>
      </div>
    </motion.div>
  );
};

export default ELearningPage;