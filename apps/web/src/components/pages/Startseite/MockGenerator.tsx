import { AnimatePresence, motion } from 'motion/react';
import { useCallback, useEffect, useRef, useState } from 'react';

const LAYERS = [
  {
    gradient: 'linear-gradient(45deg, var(--primary-500) 0%, var(--secondary-600) 50%, var(--secondary-600) 100%)',
    varName: '--layer1-opacity',
    defaultOpacity: '1',
    animation: [0.8, 0.9, 0.6, 0.3, 0.1, 0.2, 0.4, 0.7, 0.8],
  },
  {
    gradient: 'linear-gradient(135deg, var(--secondary-600) 0%, var(--primary-600) 50%, var(--secondary-600) 100%)',
    varName: '--layer2-opacity',
    defaultOpacity: '0',
    animation: [0.2, 0.5, 0.8, 0.9, 0.7, 0.4, 0.1, 0.1, 0.2],
  },
  {
    gradient: 'linear-gradient(225deg, var(--primary-400) 0%, var(--secondary-500) 50%, var(--primary-600) 100%)',
    varName: '--layer3-opacity',
    defaultOpacity: '0',
    animation: [0.1, 0.1, 0.3, 0.6, 0.9, 0.8, 0.5, 0.2, 0.1],
  },
  {
    gradient: 'linear-gradient(315deg, var(--secondary-600) 0%, var(--primary-500) 50%, var(--secondary-600) 100%)',
    varName: '--layer4-opacity',
    defaultOpacity: '0',
    animation: [0.3, 0.2, 0.1, 0.2, 0.5, 0.8, 0.9, 0.6, 0.3],
  },
  {
    gradient: 'linear-gradient(90deg, var(--secondary-600) 0%, var(--primary-600) 25%, var(--secondary-600) 50%, var(--primary-600) 75%, var(--secondary-600) 100%)',
    varName: '--layer5-opacity',
    defaultOpacity: '0',
    animation: [0.5, 0.3, 0.2, 0.1, 0.3, 0.6, 0.8, 0.9, 0.5],
  },
] as const;

const inputClass =
  'w-full font-[PT_Sans,Arial,sans-serif] text-[11px] md:text-xs leading-[1.4] text-foreground bg-input-bg border-0 rounded-sm p-1.5 md:p-2 min-h-[32px] md:min-h-[36px] outline-none opacity-80 cursor-not-allowed';

const MockGenerator = () => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [showResult, setShowResult] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const isVisibleRef = useRef(false);
  const isGeneratingRef = useRef(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const innerTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasAutoTriggeredRef = useRef(false);

  const clearAllTimeouts = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (innerTimeoutRef.current) {
      clearTimeout(innerTimeoutRef.current);
      innerTimeoutRef.current = null;
    }
  }, []);

  const handleGenerate = useCallback(() => {
    if (isGeneratingRef.current) return;

    isGeneratingRef.current = true;
    setIsGenerating(true);
    setShowResult(false);

    clearAllTimeouts();

    timeoutRef.current = setTimeout(() => {
      isGeneratingRef.current = false;
      setIsGenerating(false);
      setShowResult(true);
      timeoutRef.current = null;
    }, 1500);
  }, [clearAllTimeouts]);

  useEffect(() => {
    const node = containerRef.current;
    if (!node || typeof window === 'undefined' || typeof IntersectionObserver === 'undefined') {
      return undefined;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && entry.intersectionRatio > 0.35) {
            isVisibleRef.current = true;
            if (!hasAutoTriggeredRef.current) {
              hasAutoTriggeredRef.current = true;
              handleGenerate();
            }
          } else if (entry.intersectionRatio <= 0.35) {
            isVisibleRef.current = false;
            clearAllTimeouts();
            if (isGeneratingRef.current) {
              isGeneratingRef.current = false;
              setIsGenerating(false);
            }
          }
        });
      },
      { threshold: [0.25, 0.35, 0.5] }
    );

    observer.observe(node);

    return () => {
      observer.disconnect();
    };
  }, [handleGenerate, clearAllTimeouts]);

  useEffect(() => {
    if (showResult && isVisibleRef.current) {
      const restartTimeout = setTimeout(() => {
        setShowResult(false);
        hasAutoTriggeredRef.current = false;

        innerTimeoutRef.current = setTimeout(() => {
          if (isVisibleRef.current) {
            handleGenerate();
          }
          innerTimeoutRef.current = null;
        }, 600);
      }, 5000);

      return () => {
        clearTimeout(restartTimeout);
        if (innerTimeoutRef.current) {
          clearTimeout(innerTimeoutRef.current);
          innerTimeoutRef.current = null;
        }
      };
    }
  }, [showResult, handleGenerate]);

  useEffect(() => () => clearAllTimeouts(), [clearAllTimeouts]);

  const instagramExampleText =
    '🌱 Die Energiewende ist unser Weg in eine klimaneutrale Zukunft! 💚 Mit Wind, Sonne und Innovation schaffen wir grüne Jobs und schützen unseren Planeten. Jetzt handeln für kommende Generationen! #Klimaschutz #Energiewende #GrüneMachtZukunft';

  const gradientAnimation = isGenerating
    ? Object.fromEntries(LAYERS.map((l) => [l.varName, [...l.animation]]))
    : {};

  return (
    <div
      className="w-full h-full pointer-events-none relative flex items-center justify-center overflow-visible"
      ref={containerRef}
    >
      <div className="bg-input-bg rounded-lg p-3 md:p-4 lg:p-5 shadow-[0_4px_12px_rgba(0,0,0,0.1)] border border-[var(--border-color)] w-full min-[480px]:w-[96%] md:w-[92%] lg:w-[90%]">
        <h3 className="text-base md:text-[1.1rem] lg:text-[1.2rem] font-semibold text-foreground mb-md text-center">
          Welche Botschaft willst du heute grünerieren?
        </h3>

        {!showResult && (
          <div className="flex flex-col gap-sm mb-md">
            <div className="flex flex-col">
              <label className="text-[0.8rem] font-medium text-foreground mb-1">Thema</label>
              <input className={inputClass} value="Klimawandel und Energiewende" disabled />
            </div>

            <div className="flex flex-col">
              <label className="text-[0.8rem] font-medium text-foreground mb-1">Details</label>
              <textarea
                className={`${inputClass} resize-none min-h-[55px] md:min-h-[60px]`}
                value="Unsere grüne Zukunft beginnt heute mit erneuerbaren Energien und nachhaltiger Politik für kommende Generationen."
                disabled
                rows={3}
              />
            </div>

            <div className="flex flex-col">
              <label className="text-[0.8rem] font-medium text-foreground mb-1">Format</label>
              <div className="relative">
                <div className={`${inputClass} flex items-center justify-between`}>
                  <span className="flex items-center gap-1.5 text-foreground text-xs">
                    <span className="text-base">📸</span>
                    Instagram
                  </span>
                  <div className="text-accent font-bold">✓</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {!showResult && (
          <motion.button
            className="relative overflow-hidden py-2.5 md:py-3 px-4 md:px-5 border-none rounded-[var(--button-border-radius,5px)] bg-primary-500 text-[var(--weiß)] font-[PT_Sans,Arial,sans-serif] text-[0.85rem] md:text-[0.9rem] font-medium cursor-pointer w-full min-h-[38px] md:min-h-[40px] transition-all duration-[250ms] ease-out hover:scale-[1.01] disabled:cursor-wait disabled:opacity-90 pointer-events-auto"
            onClick={handleGenerate}
            disabled={isGenerating}
            animate={gradientAnimation as Record<string, number[]>}
            transition={
              isGenerating
                ? {
                    duration: 5,
                    ease: [0.25, 0.46, 0.45, 0.94],
                    repeat: Infinity,
                    times: [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1],
                  }
                : {
                    duration: 0.25,
                    ease: 'easeOut',
                  }
            }
          >
            {LAYERS.map((layer, i) => (
              <motion.div
                key={i}
                className="absolute inset-0 pointer-events-none"
                style={{
                  background: layer.gradient,
                  opacity: `var(${layer.varName}, ${layer.defaultOpacity})`,
                }}
              />
            ))}

            <div className="relative z-[1] flex items-center justify-center gap-sm">
              {isGenerating && (
                <span className="inline-flex items-center justify-center">
                  <div className="w-4 h-4 border-2 border-white/30 rounded-full border-t-white animate-spin" />
                </span>
              )}
              <span>{isGenerating ? 'Grüneriere...' : 'Grünerieren'}</span>
            </div>
          </motion.button>
        )}

        <AnimatePresence mode="wait">
          {showResult && (
            <motion.div
              className="mt-md bg-background border border-[var(--border-color)] rounded-sm p-md shadow-[0_2px_8px_rgba(0,0,0,0.1)]"
              initial={{ opacity: 0, y: 10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.95 }}
              transition={{
                duration: 0.5,
                ease: [0.34, 1.56, 0.64, 1],
                scale: { duration: 0.6, ease: [0.34, 1.56, 0.64, 1] },
              }}
            >
              <div className="flex items-center gap-sm mb-sm font-medium text-foreground">
                <div className="text-lg">📸</div>
                <span>Instagram Post generiert</span>
              </div>
              <div className="text-[0.8rem] md:text-[0.9rem] leading-[1.5] text-foreground bg-input-bg p-sm rounded-sm border-l-[3px] border-l-accent">
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
