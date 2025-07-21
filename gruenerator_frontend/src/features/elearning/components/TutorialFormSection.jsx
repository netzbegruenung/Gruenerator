import React from 'react';
import { motion } from 'motion/react';
import { HiArrowLeft, HiArrowRight, HiCheckCircle, HiOutlineBookOpen } from 'react-icons/hi';

const TutorialFormSection = ({
  currentStep,
  totalSteps,
  isFirstStep,
  isLastStep,
  onNext,
  onPrevious,
  onComplete,
  stepTitle
}) => {
  
  const progressPercentage = ((currentStep + 1) / totalSteps) * 100;

  return (
    <div className="tutorial-form-section">
      <div className="tutorial-form-card">
        {/* Tutorial Info */}
        <div className="tutorial-form-header">
          <div className="tutorial-form-icon">
            <HiOutlineBookOpen />
          </div>
          <h3 className="tutorial-form-title">Grünerator Tutorial</h3>
          <p className="tutorial-form-subtitle">Lerne Schritt für Schritt</p>
        </div>

        {/* Progress Section */}
        <div className="tutorial-progress-section">
          <div className="progress-header">
            <span className="progress-label">Fortschritt</span>
            <span className="progress-percentage">{Math.round(progressPercentage)}%</span>
          </div>
          
          <div className="tutorial-progress-bar">
            <motion.div 
              className="tutorial-progress-fill"
              initial={{ width: 0 }}
              animate={{ width: `${progressPercentage}%` }}
              transition={{ duration: 0.5, ease: "easeOut" }}
            />
          </div>
          
          <div className="progress-text">
            Schritt {currentStep + 1} von {totalSteps}
          </div>
        </div>

        {/* Current Step Info */}
        <div className="tutorial-step-info">
          <h4 className="step-title">{stepTitle}</h4>
          <div className="step-description">
            {currentStep === 0 && "Willkommen! Lass uns anfangen."}
            {currentStep === 1 && "Lerne die Oberfläche kennen."}
            {currentStep === 2 && "Entdecke die Formularfelder."}
            {currentStep === 3 && "Verstehe die Text-Generierung."}
            {currentStep === 4 && "Nutze alle verfügbaren Aktionen."}
            {currentStep === 5 && "Tutorial erfolgreich abgeschlossen!"}
          </div>
        </div>

        {/* Step Navigation */}
        <div className="tutorial-step-navigation">
          <div className="step-dots">
            {Array.from({ length: totalSteps }, (_, index) => (
              <motion.div
                key={index}
                className={`step-dot ${index <= currentStep ? 'active' : ''} ${index === currentStep ? 'current' : ''}`}
                initial={{ scale: 0.8 }}
                animate={{ scale: index === currentStep ? 1.2 : 1 }}
                transition={{ duration: 0.2 }}
              >
                {index < currentStep ? (
                  <HiCheckCircle className="step-check" />
                ) : (
                  <span className="step-number">{index + 1}</span>
                )}
              </motion.div>
            ))}
          </div>
        </div>

        {/* Navigation Buttons */}
        <div className="tutorial-navigation-buttons">
          {!isFirstStep && (
            <motion.button
              className="tutorial-nav-button previous"
              onClick={onPrevious}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <HiArrowLeft />
              <span>Zurück</span>
            </motion.button>
          )}
          
          {!isLastStep ? (
            <motion.button
              className="tutorial-nav-button next primary"
              onClick={onNext}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              style={{ marginLeft: isFirstStep ? 'auto' : 'var(--spacing-small)' }}
            >
              <span>Weiter</span>
              <HiArrowRight />
            </motion.button>
          ) : (
            <motion.button
              className="tutorial-nav-button complete primary"
              onClick={onComplete}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              style={{ marginLeft: 'auto' }}
            >
              <span>Tutorial beenden</span>
              <HiCheckCircle />
            </motion.button>
          )}
        </div>

        {/* Tutorial Tips */}
        <div className="tutorial-tips-section">
          <h5 className="tips-title">💡 Tipp</h5>
          <div className="tip-content">
            {currentStep === 0 && "Nimm dir Zeit und gehe in deinem eigenen Tempo vor."}
            {currentStep === 1 && "Die Aufteilung 1/3 + 2/3 findest du in allen Grüneratoren."}
            {currentStep === 2 && "Je detaillierter deine Eingaben, desto besser das Ergebnis."}
            {currentStep === 3 && "Du kannst jederzeit mehrere Versionen generieren lassen."}
            {currentStep === 4 && "Experimentiere mit verschiedenen Export-Formaten."}
            {currentStep === 5 && "Probiere verschiedene Grüneratoren für unterschiedliche Textarten."}
          </div>
        </div>

        {/* Help Section */}
        <div className="tutorial-help-section">
          <h5 className="help-title">❓ Hilfe benötigt?</h5>
          <p className="help-text">
            Falls du Fragen hast, findest du weitere Informationen in der Dokumentation 
            oder kontaktiere unser Support-Team.
          </p>
        </div>
      </div>
    </div>
  );
};

export default TutorialFormSection;