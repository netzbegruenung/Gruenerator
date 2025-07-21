import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { HiOutlineAcademicCap, HiOutlineLightBulb, HiOutlineInformationCircle } from 'react-icons/hi';
import ChapterCard from './ChapterCard';
import { useBetaFeatures } from '../../../hooks/useBetaFeatures';
import { useOptimizedAuth } from '../../../hooks/useAuth';

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

  // Tutorial chapters data
  const tutorialChapters = [
    {
      id: 'gruenerator-tutorial',
      title: 'Grünerator Tutorial - Wie funktioniert der Text-Generator?',
      description: 'Lerne Schritt für Schritt, wie du den Grünerator verwendest. Entdecke die Benutzeroberfläche, erstelle deinen ersten Text und nutze alle verfügbaren Funktionen.',
      duration: '15 Min',
      difficulty: 'Einsteiger',
      topics: ['Bedienung', 'Text-Generierung', 'Benutzeroberfläche'],
      comingSoon: false
    }
  ];

  const handleStartLearning = (chapterId) => {
    if (chapterId === 'gruenerator-tutorial') {
      // Navigate to the tutorial
      window.location.href = '/e-learning/gruenerator-tutorial';
    } else {
      alert('Dieses Kapitel ist noch in Entwicklung und wird bald verfügbar sein.');
    }
  };

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
          className="chapters-section"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.3 }}
        >
          <div className="section-header">
            <h2>Verfügbare Kapitel</h2>
            <p>Wähle ein Kapitel aus, um mit dem Lernen zu beginnen</p>
          </div>

          <div className="chapters-grid">
            {tutorialChapters.map((chapter, index) => (
              <motion.div
                key={chapter.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.1 * index }}
              >
                <ChapterCard
                  title={chapter.title}
                  description={chapter.description}
                  duration={chapter.duration}
                  difficulty={chapter.difficulty}
                  topics={chapter.topics}
                  disabled={chapter.comingSoon}
                  className={chapter.comingSoon ? 'coming-soon' : ''}
                  onStartLearning={() => handleStartLearning(chapter.id)}
                />
                {chapter.comingSoon && (
                  <div className="coming-soon-badge">
                    Bald verfügbar
                  </div>
                )}
              </motion.div>
            ))}
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
              <li>✅ Interaktive Lernmodule zu aktuellen politischen Themen</li>
              <li>✅ Praktische Anwendungen für dein politisches Engagement</li>
              <li>✅ Fundierte Informationen von Expert:innen</li>
              <li>⏳ Progress-Tracking und Zertifikate (in Entwicklung)</li>
              <li>⏳ Community-Features und Diskussionen (geplant)</li>
            </ul>
          </div>
        </motion.section>
      </div>
    </motion.div>
  );
};

export default ELearningPage;