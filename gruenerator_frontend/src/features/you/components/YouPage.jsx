import React, { useState, useRef, useEffect, useContext } from 'react';
import { FaArrowUp, FaMicrophone, FaStop } from 'react-icons/fa';
import PropTypes from 'prop-types';
import ErrorBoundary from '../../../components/ErrorBoundary';
import useVoiceRecorder from '../../voice/hooks/useVoiceRecorder';
import useYouProcessor from '../hooks/useYouProcessor';
import useEditorLayout from '../hooks/useEditorLayout';
import Spinner from '../../../components/common/Spinner';
// Nur die Hauptdatei importieren, die dann die anderen CSS-Dateien importiert
// Import der DisplaySection-Komponente
import DisplaySection from '../../../components/common/Form/BaseForm/DisplaySection';
// Import des FormContext
import { FormContext } from '../../../components/utils/FormContext';

// Beispiele für Prompts mit kurzen Titeln und vollständigen Prompts
const EXAMPLES = [
  {
    icon: '📝',
    text: 'Antrag: Radverkehr fördern',
    fullPrompt: 'Erstelle einen Antrag zur Förderung des Radverkehrs in unserer Stadt. Der Antrag soll konkrete Maßnahmen enthalten, die den Radverkehr sicherer und attraktiver machen. Berücksichtige dabei aktuelle Klimaschutzziele und beziehe dich auf erfolgreiche Beispiele aus anderen Städten. Der Antrag soll maximal 2 Seiten umfassen und sowohl die Begründung als auch einen konkreten Beschlussvorschlag enthalten.'
  },
  {
    icon: '🎤',
    text: 'Rede: Haushaltsberatung',
    fullPrompt: 'Schreibe eine kurze Rede für die Haushaltsberatung im Stadtrat. Die Rede soll betonen, warum Klimaschutzmaßnahmen trotz knapper Kassen finanziert werden müssen. Verwende überzeugende Argumente, die sowohl ökologische als auch wirtschaftliche Aspekte berücksichtigen. Die Rede sollte etwa 3 Minuten dauern und mit einem starken Appell enden, der zum Handeln auffordert.'
  }
];

// Fallback-Komponente für die ErrorBoundary
const ErrorFallback = (error) => {
  return (
    <div className="you-error">
      <p>Ein Fehler ist aufgetreten:</p>
      <pre>{error && error.message}</pre>
      <button onClick={() => window.location.reload()} className="analyze-button">
        Zurücksetzen
      </button>
    </div>
  );
};

// Extrahierte Komponente für Beispiele
const InlineExamples = ({ onExampleClick, shouldShow }) => {
  // Wenn shouldShow false ist, zeige keine Beispiele an
  if (!shouldShow) return null;
  
  return (
    <div className="inline-examples">
      {EXAMPLES.map((example, index) => (
        <button
          key={index}
          className="inline-example"
          onClick={(e) => {
            e.preventDefault(); // Verhindert das Absenden des Formulars
            onExampleClick(example.fullPrompt);
          }}
          title={example.fullPrompt}
          type="button" // Explizit als Button-Typ definieren, nicht als Submit
        >
          <span>{example.icon}</span>
          <span>{example.text}</span>
        </button>
      ))}
    </div>
  );
};

InlineExamples.propTypes = {
  onExampleClick: PropTypes.func.isRequired,
  shouldShow: PropTypes.bool
};

// Extrahierte Komponente für die Aufnahme-Overlay
const RecordingOverlay = ({ isRecording, stopRecording }) => (
  <div className={`recording-fullscreen-overlay ${isRecording ? 'active' : ''}`}>
    <div className="recording-animation-container">
      <div className="recording-lottie">
        {/* Lottie Animation Removed */}
      </div>
    </div>
    
    <button
      type="button"
      className="recording-stop-button"
      onClick={stopRecording}
      aria-label="Aufnahme stoppen"
    >
      <FaStop />
    </button>
  </div>
);

RecordingOverlay.propTypes = {
  isRecording: PropTypes.bool.isRequired,
  stopRecording: PropTypes.func.isRequired
};

// Hauptkomponente
const YouPage = () => {
  const [prompt, setPrompt] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [socialMediaContent, setSocialMediaContent] = useState('');
  const [isMobile, setIsMobile] = useState(false);
  const textareaRef = useRef(null);
  
  // You-Processor Hook für die Verarbeitung der Anfragen
  const {
    isProcessing,
    result,
    processPrompt,
    reset: resetProcessor,
    getError: getProcessorError
  } = useYouProcessor();
  
  // Voice Recorder Hook
  const {
    isRecording,
    isProcessing: isVoiceProcessing,
    error: voiceError,
    startRecording,
    stopRecording,
    processRecording
  } = useVoiceRecorder((text) => {
    setPrompt(text);
  }, { 
    removeTimestamps: true 
  });

  // Setze den Inhalt in den FormContext
  const { 
    setGeneratedContent, 
    updateValue, 
    toggleEditMode
  } = useContext(FormContext);

  // Überprüfe, ob es sich um ein mobiles Gerät handelt
  useEffect(() => {
    const checkIfMobile = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    
    // Initial prüfen
    checkIfMobile();
    
    // Event-Listener für Größenänderungen
    window.addEventListener('resize', checkIfMobile);
    
    // Cleanup
    return () => {
      window.removeEventListener('resize', checkIfMobile);
    };
  }, []);

  // Log für das result
  useEffect(() => {
    if (result) {
      setSocialMediaContent(result);
      setGeneratedContent(result);
      updateValue(result);
    }
  }, [result, setGeneratedContent, updateValue, socialMediaContent]);

  // Verarbeite die Aufnahme automatisch, wenn sie gestoppt wurde
  useEffect(() => {
    processRecording();
  }, [isRecording, processRecording]);

  // Automatische Anpassung der Textarea-Höhe
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [prompt]);

  // Hauptfunktion zum Verarbeiten der Anfrage
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!prompt.trim() || isProcessing) return;
    
    // Verarbeite den Prompt mit dem Hook
    const content = await processPrompt(prompt);
    if (content) {
      setSocialMediaContent(content);
      setGeneratedContent(content);
      updateValue(content);
    }
  };

  const handleExampleClick = (exampleText) => {
    setPrompt(exampleText);
    if (textareaRef.current) {
      textareaRef.current.focus();
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.selectionStart = exampleText.length;
          textareaRef.current.selectionEnd = exampleText.length;
        }
      }, 0);
    }
  };

  // Funktion zum Umschalten zwischen Mikrofon und Submit-Button
  const renderSubmitOrMicButton = () => {
    // Wenn wir aufnehmen, zeige den Stop-Button
    if (isRecording) {
      return (
        <button
          type="button"
          className="you-submit-button recording"
          onClick={stopRecording}
          aria-label="Aufnahme stoppen"
        >
          <FaStop />
        </button>
      );
    }
    
    // Wenn wir verarbeiten (Sprache oder Text), zeige den Spinner
    if (isVoiceProcessing || isProcessing) {
      return (
        <button
          type="button"
          className="you-submit-button"
          disabled={true}
          aria-label="Verarbeitung läuft"
        >
          <Spinner size="small" white withBackground />
        </button>
      );
    }
    
    // Wenn Text eingegeben wurde, zeige den Submit-Button
    if (prompt.trim()) {
      return (
        <button
          type="submit"
          className="you-submit-button"
          disabled={isProcessing || isVoiceProcessing}
          aria-label="Absenden"
        >
          <FaArrowUp />
        </button>
      );
    }
    
    // Standardfall: Zeige den Mikrofon-Button
    return (
      <button
        type="button"
        className="you-submit-button"
        onClick={startRecording}
        disabled={isProcessing || isVoiceProcessing}
        aria-label="Sprachaufnahme"
      >
        <FaMicrophone />
      </button>
    );
  };

  const handleReset = () => {
    setPrompt('');
    setSocialMediaContent('');
    resetProcessor();
  };

  // Bestimme, ob ein Fehler vorliegt
  const getError = () => {
    return getProcessorError() || voiceError;
  };

  // Funktion zum Umschalten des Bearbeitungsmodus
  const handleToggleEditMode = () => {
    toggleEditMode();
    setIsEditing(!isEditing);
  };

  // Funktion zum Abrufen des exportierbaren Inhalts
  const getExportableContent = (content, value) => {
    // Wenn content ein String ist, direkt zurückgeben
    if (content && typeof content === 'string') {
      return content;
    }
    
    // Wenn content ein Objekt mit content-Eigenschaft ist
    if (content && typeof content === 'object' && content.content) {
      return content.content;
    }
    
    // Fallback auf value
    return value || '';
  };

  // Funktion zum Aktualisieren des generierten Inhalts
  const handleGeneratedContentChange = (content) => {
    setSocialMediaContent(content);
    setGeneratedContent(content);
    updateValue(content);
  };

  // Bestimme, ob wir uns im leeren Zustand befinden
  const isEmptyState = !socialMediaContent;

  // Bestimme, ob die Beispiele angezeigt werden sollen
  // Auf Mobilgeräten: nur anzeigen, wenn kein Text eingegeben wurde
  const shouldShowExamples = !isProcessing && !socialMediaContent && (!isMobile || !prompt.trim());

  // Bestimme die CSS-Klassen für den Container basierend auf dem Bearbeitungsmodus
  // Im Bearbeitungsmodus verwenden wir die with-header-Klasse nicht, da wir den Abstand direkt in der CSS definieren
  const containerClasses = `you-page-container ${!isEmptyState && !isEditing ? 'with-header' : ''} ${isEditing ? 'base-container editing-mode' : ''}`;
  const contentWrapperClasses = `you-content-wrapper ${isEmptyState ? 'empty-state' : ''}`;
  const resultSectionClasses = `you-result-section ${isEditing ? 'display-container' : ''}`;

  // Verwende den useEditorLayout-Hook für mobile Anpassungen
  const { getEditorContainerStyle, getMainContainerStyle } = useEditorLayout(isMobile, isEditing);

  return (
    <ErrorBoundary fallback={ErrorFallback}>
      <div className={containerClasses} style={getMainContainerStyle()}>
        <div className={contentWrapperClasses} style={getEditorContainerStyle()}>
          {/* Input-Bereich (nur anzeigen, wenn nicht im Bearbeitungsmodus) */}
          {!isEditing && (
            <div className="you-input-section">
              <header className="you-header">
                <h1>Was willst du heute Grünerieren?</h1>
              </header>

              <form onSubmit={handleSubmit} className="you-input-container">
                <textarea
                  ref={textareaRef}
                  className="you-input-field"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="Stelle eine Frage oder beschreibe dein Anliegen..."
                  rows={3}
                  disabled={isProcessing}
                />
                
                <InlineExamples 
                  onExampleClick={handleExampleClick} 
                  shouldShow={shouldShowExamples}
                />
                
                {/* Fullscreen Recording Overlay als eigene Komponente */}
                <RecordingOverlay 
                  isRecording={isRecording} 
                  stopRecording={stopRecording} 
                />
                
                {/* Dynamischer Button: Mikrofon oder Submit */}
                {renderSubmitOrMicButton()}
              </form>

              {getError() && (
                <div className="you-error">
                  {getError()}
                  <button onClick={handleReset} className="you-reset-button mt-3">
                    Neue Anfrage
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Ergebnis-Bereich */}
          {socialMediaContent && (
            <div className={resultSectionClasses}>
              <DisplaySection
                title={isEditing ? "Grünerator Editor" : "Dein Ergebnis"}
                error={getError()}
                value={socialMediaContent}
                generatedContent={socialMediaContent}
                isEditing={isEditing}
                allowEditing={true}
                hideEditButton={false}
                usePlatformContainers={false}
                handleToggleEditMode={handleToggleEditMode}
                getExportableContent={getExportableContent}
                onGeneratedContentChange={handleGeneratedContentChange}
              />

              {!isEditing && (
                <div className="you-reset-button-container">
                  <button 
                    onClick={handleReset} 
                    className="you-reset-button"
                  >
                    Neue Anfrage
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </ErrorBoundary>
  );
};

export default YouPage; 