import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import '../../../assets/styles/components/mock-generator.css';

const MockGenerator = () => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [showResult, setShowResult] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasAutoTriggeredRef = useRef(false);

  const handleGenerate = useCallback(() => {
    if (isGenerating) return;

    setIsGenerating(true);
    setShowResult(false);

    // Simulate generation delay
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = setTimeout(() => {
      setIsGenerating(false);
      setShowResult(true);
      timeoutRef.current = null;
    }, 1500);
  }, [isGenerating]);

  useEffect(() => {
    const node = containerRef.current;
    if (!node || typeof window === 'undefined' || typeof IntersectionObserver === 'undefined') {
      return undefined;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && entry.intersectionRatio > 0.35) {
            setIsVisible(true);
            if (!hasAutoTriggeredRef.current) {
              hasAutoTriggeredRef.current = true;
              handleGenerate();
            }
          } else if (entry.intersectionRatio <= 0.35) {
            setIsVisible(false);
          }
        });
      },
      {
        threshold: [0.25, 0.35, 0.5],
      }
    );

    observer.observe(node);

    return () => {
      observer.disconnect();
    };
  }, [handleGenerate]);

  useEffect(() => {
    if (showResult && isVisible) {
      const restartTimeout = setTimeout(() => {
        setShowResult(false);
        hasAutoTriggeredRef.current = false;

        setTimeout(() => {
          if (isVisible) {
            handleGenerate();
          }
        }, 600);
      }, 5000);

      return () => clearTimeout(restartTimeout);
    }
  }, [showResult, isVisible, handleGenerate]);

  useEffect(() => {
    if (!isVisible) {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      if (isGenerating) {
        setIsGenerating(false);
      }
    }
  }, [isVisible, isGenerating]);

  useEffect(() => () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
  }, []);

  const instagramExampleText = "🌱 Die Energiewende ist unser Weg in eine klimaneutrale Zukunft! 💚 Mit Wind, Sonne und Innovation schaffen wir grüne Jobs und schützen unseren Planeten. Jetzt handeln für kommende Generationen! #Klimaschutz #Energiewende #GrüneMachtZukunft";

  // Gradient animation for loading state
  const gradientAnimation = isGenerating ? {
    '--layer1-opacity': [0.8, 0.9, 0.6, 0.3, 0.1, 0.2, 0.4, 0.7, 0.8],
    '--layer2-opacity': [0.2, 0.5, 0.8, 0.9, 0.7, 0.4, 0.1, 0.1, 0.2],
    '--layer3-opacity': [0.1, 0.1, 0.3, 0.6, 0.9, 0.8, 0.5, 0.2, 0.1],
    '--layer4-opacity': [0.3, 0.2, 0.1, 0.2, 0.5, 0.8, 0.9, 0.6, 0.3],
    '--layer5-opacity': [0.5, 0.3, 0.2, 0.1, 0.3, 0.6, 0.8, 0.9, 0.5]
  } : {};

  return (
    <div className="mock-generator-interface" ref={containerRef}>
      <div className="mock-form-container">
        <h3 className="mock-form-title">Welche Botschaft willst du heute grünerieren?</h3>

        {!showResult && (
          <div className="mock-form-fields">
            <div className="mock-input-field">
              <label className="mock-field-label">Thema</label>
              <input
                className="mock-form-input"
                value="Klimawandel und Energiewende"
                disabled
              />
            </div>

            <div className="mock-input-field">
              <label className="mock-field-label">Details</label>
              <textarea
                className="mock-form-textarea"
                value="Unsere grüne Zukunft beginnt heute mit erneuerbaren Energien und nachhaltiger Politik für kommende Generationen."
                disabled
                rows={3}
              />
            </div>

            <div className="mock-input-field">
              <label className="mock-field-label">Format</label>
              <div className="mock-select-field">
                <div className="mock-select-control">
                  <span className="mock-select-value">
                    <span className="mock-platform-icon">📸</span>
                    Instagram
                  </span>
                  <div className="mock-select-indicator">✓</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {!showResult && (
          <motion.button
            className="mock-submit-button"
            onClick={handleGenerate}
            disabled={isGenerating}
            animate={gradientAnimation}
            transition={
              isGenerating ? {
                duration: 5,
                ease: [0.25, 0.46, 0.45, 0.94],
                repeat: Infinity,
                times: [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1]
              } : {
                duration: 0.25,
                ease: "easeOut"
              }
            }
          >
          {/* Gradient Layer 1 */}
          <motion.div
            className="mock-submit-button__gradient-layer mock-submit-button__gradient-layer--1"
            style={{ opacity: 'var(--layer1-opacity, 1)' }}
          />

          {/* Gradient Layer 2 */}
          <motion.div
            className="mock-submit-button__gradient-layer mock-submit-button__gradient-layer--2"
            style={{ opacity: 'var(--layer2-opacity, 0)' }}
          />

          {/* Gradient Layer 3 */}
          <motion.div
            className="mock-submit-button__gradient-layer mock-submit-button__gradient-layer--3"
            style={{ opacity: 'var(--layer3-opacity, 0)' }}
          />

          {/* Gradient Layer 4 */}
          <motion.div
            className="mock-submit-button__gradient-layer mock-submit-button__gradient-layer--4"
            style={{ opacity: 'var(--layer4-opacity, 0)' }}
          />

          {/* Gradient Layer 5 */}
          <motion.div
            className="mock-submit-button__gradient-layer mock-submit-button__gradient-layer--5"
            style={{ opacity: 'var(--layer5-opacity, 0)' }}
          />

          {/* Content wrapper */}
          <div className="mock-submit-button__content-wrapper">
            <div className="mock-submit-button__content">
              {isGenerating && (
                <span className="mock-submit-button__loading-spinner">
                  <div className="mock-spinner"></div>
                </span>
              )}
              <span>{isGenerating ? 'Grüneriere...' : 'Grünerieren'}</span>
            </div>
          </div>
          </motion.button>
        )}

        <AnimatePresence mode="wait">
          {showResult && (
            <motion.div
              className="mock-result-container"
              initial={{ opacity: 0, y: 10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.95 }}
              transition={{
                duration: 0.5,
                ease: [0.34, 1.56, 0.64, 1],
                scale: { duration: 0.6, ease: [0.34, 1.56, 0.64, 1] }
              }}
            >
              <div className="mock-result-header">
                <div className="mock-instagram-icon">📸</div>
                <span>Instagram Post generiert</span>
              </div>
              <div className="mock-result-content">
                {instagramExampleText}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default MockGenerator;
