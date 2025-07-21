import React from 'react';
import { motion } from 'motion/react';
import { HiOutlineBookOpen, HiOutlineLightBulb, HiOutlineDesktopComputer } from 'react-icons/hi';

// Mock components for demonstration
const MockFormField = ({ label, placeholder, value }) => (
  <div className="tutorial-mock-field">
    <label className="tutorial-mock-label">{label}</label>
    <div className="tutorial-mock-input">
      {value || placeholder}
    </div>
  </div>
);

const MockButton = ({ children, primary = false, disabled = false }) => (
  <div className={`tutorial-mock-button ${primary ? 'primary' : ''} ${disabled ? 'disabled' : ''}`}>
    {children}
  </div>
);

const MockActionButton = ({ icon: Icon, label }) => (
  <div className="tutorial-mock-action">
    <Icon className="tutorial-mock-action-icon" />
    <span>{label}</span>
  </div>
);

const InterfaceExample = () => (
  <div className="tutorial-interface-example">
    <div className="tutorial-mock-container">
      <div className="tutorial-mock-form-section">
        <div className="tutorial-mock-card">
          <h4>📝 Formular</h4>
          <MockFormField 
            label="Thema" 
            placeholder="Gib dein Thema ein..."
            value="Klimaschutz in der Stadt"
          />
          <MockFormField 
            label="Zielgruppe" 
            placeholder="Für wen schreibst du?"
            value="Stadtrat"
          />
          <MockButton primary>Text generieren</MockButton>
        </div>
      </div>
      <div className="tutorial-mock-display-section">
        <div className="tutorial-mock-content">
          <h4>📄 Generierter Text</h4>
          <div className="tutorial-mock-text">
            <p>Sehr geehrte Damen und Herren des Stadtrats,</p>
            <p>der Klimaschutz ist eine der wichtigsten Aufgaben unserer Zeit...</p>
            <div className="tutorial-mock-actions">
              <MockActionButton icon={HiOutlineBookOpen} label="Bearbeiten" />
              <MockActionButton icon={HiOutlineLightBulb} label="Kopieren" />
              <MockActionButton icon={HiOutlineDesktopComputer} label="Export" />
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
);

const FormExample = () => (
  <div className="tutorial-form-example">
    <div className="tutorial-mock-form-detailed">
      <h4>Beispiel: Antrag-Generator</h4>
      <div className="tutorial-form-steps">
        <div className="form-step">
          <span className="step-number">1</span>
          <div className="step-content">
            <MockFormField 
              label="Thema des Antrags" 
              placeholder="z.B. Klimaschutz in der Stadt"
              value="Solarenergie für städtische Gebäude"
            />
          </div>
        </div>
        <div className="form-step">
          <span className="step-number">2</span>
          <div className="step-content">
            <MockFormField 
              label="Begründung" 
              placeholder="Warum ist das wichtig?"
              value="Reduzierung der CO2-Emissionen und Kostenersparnis"
            />
          </div>
        </div>
        <div className="form-step">
          <span className="step-number">3</span>
          <div className="step-content">
            <div className="tutorial-mock-options">
              <h5>Erweiterte Optionen</h5>
              <div className="option-item">☑️ Web-Suche verwenden</div>
              <div className="option-item">☑️ Wissensdatenbank einbeziehen</div>
              <div className="option-item">☐ Formeller Stil</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
);

const GenerationExample = () => (
  <div className="tutorial-generation-example">
    <div className="generation-demo">
      <h4>🤖 Live-Generierung Simulation</h4>
      <div className="generation-process">
        <div className="process-step completed">
          <div className="step-indicator">✓</div>
          <span>Eingaben analysiert</span>
        </div>
        <div className="process-step completed">
          <div className="step-indicator">✓</div>
          <span>Informationen recherchiert</span>
        </div>
        <div className="process-step active">
          <div className="step-indicator spinning">⟳</div>
          <span>Text wird erstellt...</span>
        </div>
        <div className="process-step">
          <div className="step-indicator">○</div>
          <span>Finalisierung</span>
        </div>
      </div>
      
      <div className="streaming-text">
        <h5>Text entsteht live:</h5>
        <div className="mock-streaming">
          <p>Antrag zur Installation von Solaranlagen auf städtischen Gebäuden</p>
          <p>Sehr geehrte Damen und Herren,</p>
          <p>hiermit beantrage ich die Prüfung und Umsetzung einer umfassenden Solar-Initiative für alle geeigneten städtischen Gebäude<span className="cursor">|</span></p>
        </div>
      </div>
    </div>
  </div>
);

const ActionsExample = () => (
  <div className="tutorial-actions-example">
    <div className="actions-demo">
      <h4>🛠️ Action-Buttons Demo</h4>
      <div className="mock-action-bar">
        <MockActionButton icon={HiOutlineBookOpen} label="Bearbeiten" />
        <MockActionButton icon={HiOutlineLightBulb} label="Kopieren" />
        <MockActionButton icon={HiOutlineDesktopComputer} label="Export" />
      </div>
      
      <div className="action-explanation">
        <div className="action-detail">
          <h5>✏️ Bearbeiten</h5>
          <p>Öffnet einen Editor um den Text anzupassen</p>
        </div>
        <div className="action-detail">
          <h5>📋 Kopieren</h5>
          <p>Kopiert den Text in die Zwischenablage</p>
        </div>
        <div className="action-detail">
          <h5>💾 Export</h5>
          <p>Download als Word, PDF oder andere Formate</p>
        </div>
      </div>
    </div>
  </div>
);

const TutorialDisplaySection = ({ step, currentStep, totalSteps }) => {
  const renderExample = () => {
    if (!step.showExample) return null;

    switch (step.exampleType) {
      case 'interface':
        return <InterfaceExample />;
      case 'form':
        return <FormExample />;
      case 'generation':
        return <GenerationExample />;
      case 'actions':
        return <ActionsExample />;
      default:
        return null;
    }
  };

  return (
    <div className="tutorial-display-section">
      {/* Tutorial Header */}
      <div className="tutorial-display-header">
        <div className="tutorial-icon">
          <HiOutlineBookOpen />
        </div>
        <div className="tutorial-meta">
          <h2 className="tutorial-title">{step.title}</h2>
          <div className="tutorial-progress-text">
            Schritt {currentStep + 1} von {totalSteps}
          </div>
        </div>
      </div>

      {/* Tutorial Content */}
      <motion.div 
        className="tutorial-display-content"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <div className="tutorial-content-text">
          <div 
            className="tutorial-text-content"
            dangerouslySetInnerHTML={{ __html: step.content }}
          />
        </div>

        {/* Interactive Example */}
        {step.showExample && (
          <motion.div 
            className="tutorial-example-section"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, delay: 0.2 }}
          >
            <div className="example-header">
              <HiOutlineLightBulb className="example-icon" />
              <h4>Interaktives Beispiel</h4>
            </div>
            {renderExample()}
          </motion.div>
        )}
      </motion.div>
    </div>
  );
};

export default TutorialDisplaySection;