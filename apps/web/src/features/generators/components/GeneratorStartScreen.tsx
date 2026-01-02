import React from 'react';
import TextareaAutosize from 'react-textarea-autosize';

interface ExamplePrompt {
  icon: string;
  text: string;
  fullPrompt: string;
}

interface ExamplePromptsProps {
  onExampleClick: (prompt: string) => void;
}

interface GeneratorStartScreenProps {
  aiDescription: string;
  onDescriptionChange: (value: string) => void;
  onGenerateWithAI: () => void;
  onManualSetup: () => void;
  isLoading: boolean;
  error?: string | null;
}

// Define example prompts
const EXAMPLE_PROMPTS: ExamplePrompt[] = [
  {
    icon: '📰',
    text: 'Pressemitteilung: Neuer Radweg',
    fullPrompt: 'Erstelle einen Grünerator für Pressemitteilungen über neu eröffnete Radwege. Er soll nach dem Ort, der Länge des Radwegs und besonderen Merkmalen fragen.'
  },
  {
    icon: '📱',
    text: 'Social Media: Klimaschutz-Tipps',
    fullPrompt: 'Ich brauche einen Grünerator für Social-Media-Posts (Instagram, Facebook) mit kurzen Klimaschutz-Tipps für den Alltag. Er soll nach der Zielgruppe (z.B. Studierende, Familien) fragen.'
  },
  {
    icon: '📣',
    text: 'Ankündigung: Bürgerversammlung',
    fullPrompt: 'Entwickle einen Grünerator, der Ankündigungen für Bürgerversammlungen zu Umweltthemen erstellt. Er soll nach dem Thema, Datum, Uhrzeit und Ort der Versammlung fragen.'
  }
];

// Component to display example prompts
const ExamplePrompts: React.FC<ExamplePromptsProps> = ({ onExampleClick }) => (
  <div className="example-prompts">
    {EXAMPLE_PROMPTS.map((example, index) => (
      <button
        key={index}
        type="button" // Prevent form submission
        className="example-prompt-button"
        onClick={() => onExampleClick(example.fullPrompt)}
        title={example.fullPrompt}
      >
        <span>{example.icon}</span>
        <span>{example.text}</span>
      </button>
    ))}
  </div>
);

const GeneratorStartScreen: React.FC<GeneratorStartScreenProps> = ({
  aiDescription,
  onDescriptionChange,
  onGenerateWithAI,
  onManualSetup,
  isLoading,
  error,
}) => {
  // Ref for the example prompts container to measure its height
  const examplesRef = React.useRef<HTMLDivElement>(null);
  // State to store the height of the example prompts
  const [examplesHeight, setExamplesHeight] = React.useState<number>(0);

  // Handler for clicking an example prompt
  const handleExampleClick = (promptText: string): void => {
    onDescriptionChange(promptText);
    // Optional: Focus the textarea after selecting an example
    const textarea = document.getElementById('aiDescription') as HTMLTextAreaElement | null;
    if (textarea) {
      textarea.focus();
      setTimeout(() => {
        textarea.selectionStart = textarea.selectionEnd = promptText.length;
      }, 0);
    }
  };

  // Effect to measure and set the height of the examples container
  React.useEffect(() => {
    const measureHeight = () => {
      if (examplesRef.current) {
        // Add a small buffer (e.g., 8px) to the height for spacing
        setExamplesHeight(examplesRef.current.offsetHeight + 8);
      }
    };

    measureHeight(); // Measure initially

    // Optional: Use ResizeObserver for more robust height updates if content wraps
    const resizeObserver = new ResizeObserver(measureHeight);
    if (examplesRef.current) {
      resizeObserver.observe(examplesRef.current);
    }

    // Cleanup observer on unmount
    return () => resizeObserver.disconnect();
  }, [examplesRef]); // Re-run if ref changes (should not happen often)

  return (
    <div className="generator-start-screen">
      <div className="start-screen-content">
        <p className="subtitle">
          Beschreibe einfach, was dein Grünerator können soll, und die KI erledigt den Rest.
        </p>

        {/* New Wrapper Div */}
        <div className={`input-wrapper ${error ? 'error-input' : ''}`}>
          <TextareaAutosize
            id="aiDescription"
            name="aiDescription"
            className="description-input" // Keep original class for some styles, but visuals are now on wrapper
            minRows={2} // Set minimum rows instead of fixed rows or min-height
            value={aiDescription}
            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => onDescriptionChange(e.target.value)}
            placeholder="Beispiel: Ein Grünerator für Social-Media-Posts über Radwege in meiner Stadt, der nach Zielgruppe und Anlass fragt..."
            aria-label="Beschreibung für den KI-Grünerator"
            aria-describedby={error ? "start-screen-error" : undefined}
            disabled={isLoading}
            style={{ paddingBottom: `${examplesHeight}px` }} // Apply dynamic padding
            cacheMeasurements // Optional: Improves performance by caching measurements
          />

          {/* Add Example Prompts inside the wrapper, pass the ref */}
          <div ref={examplesRef} className="example-prompts-container">
            <ExamplePrompts onExampleClick={handleExampleClick} />
          </div>
        </div>

        {error && <p id="start-screen-error" className="error-message">{error}</p>}

        <button
          className="button button-primary button-large generate-button"
          onClick={onGenerateWithAI}
          disabled={isLoading || !aiDescription.trim()}
          aria-live="polite"
        >
          {isLoading ? (
            <>
              <span className="loading-spinner" /> Generiere Vorschlag...
            </>
          ) : (
            'KI-Vorschlag generieren'
          )}
        </button>

        <button
          className="button button-link manual-setup-link"
          onClick={onManualSetup}
          disabled={isLoading}
        >
          Oder: Schritt für Schritt manuell konfigurieren
        </button>
      </div>
    </div>
  );
};

export default GeneratorStartScreen;
