import { useState, useCallback } from 'react';

import { cn } from '../../../utils/cn';

interface FirstRunWizardProps {
  requireLogin: boolean;
  onComplete: () => void;
  onLogin?: () => void;
}

type ThemeOption = 'light' | 'dark' | 'auto';

const STEPS = ['welcome', 'features', 'theme', 'login', 'ready'] as const;

export function FirstRunWizard({ requireLogin, onComplete, onLogin }: FirstRunWizardProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [selectedTheme, setSelectedTheme] = useState<ThemeOption>('auto');
  const [isExiting, setIsExiting] = useState(false);

  const handleNext = useCallback(() => {
    if (currentStep === STEPS.length - 1) {
      onComplete();
      return;
    }

    setIsExiting(true);
    setTimeout(() => {
      setCurrentStep((prev) => prev + 1);
      setIsExiting(false);
    }, 300);
  }, [currentStep, onComplete]);

  const handleBack = useCallback(() => {
    if (currentStep === 0) return;

    setIsExiting(true);
    setTimeout(() => {
      setCurrentStep((prev) => prev - 1);
      setIsExiting(false);
    }, 300);
  }, [currentStep]);

  const handleThemeSelect = useCallback((theme: ThemeOption) => {
    setSelectedTheme(theme);

    if (theme === 'auto') {
      document.documentElement.removeAttribute('data-theme');
      localStorage.removeItem('theme');
    } else {
      document.documentElement.setAttribute('data-theme', theme);
      localStorage.setItem('theme', theme);
    }
  }, []);

  const handleLogin = useCallback(() => {
    if (onLogin) {
      onLogin();
    }
  }, [onLogin]);

  const handleSkipLogin = useCallback(() => {
    handleNext();
  }, [handleNext]);

  const stepClass = cn(
    'w-full max-w-[800px] animate-[wizardFadeIn_0.4s_ease-out] max-[1280px]:max-w-[700px] max-[1024px]:max-w-[600px] max-md:max-w-full',
    isExiting && 'animate-[wizardFadeOut_0.3s_ease-in_forwards]'
  );

  const renderStep = () => {
    switch (STEPS[currentStep]) {
      case 'welcome':
        return (
          <div
            className={cn(
              'text-center py-[40px] px-[20px] max-md:py-[20px] max-md:px-[15px]',
              stepClass
            )}
          >
            <img
              className="w-[clamp(180px,25vw,300px)] max-w-[80%] mb-[clamp(20px,3vw,30px)] animate-[logoFloat_3s_ease-in-out_infinite]"
              src="/images/Logo_Grün.svg"
              alt="Grünerator"
            />
            <h1 className="text-[clamp(1.8rem,4vw,2.5rem)] text-foreground-heading mb-[16px] bg-gradient-to-r from-[var(--klee)] to-[var(--font-color-h)] bg-clip-text [-webkit-background-clip:text] [-webkit-text-fill-color:transparent]">
              Willkommen beim Grünerator
            </h1>
            <p className="text-[1.2rem] text-foreground opacity-80 max-w-[500px] mx-auto leading-relaxed">
              KI-gestützte Textgenerierung für Grüne. Erstelle professionelle Texte, Sharepics und
              mehr – schnell und einfach.
            </p>
          </div>
        );

      case 'features':
        return (
          <div className={stepClass}>
            <h2 className="text-center text-[clamp(1.4rem,3vw,1.8rem)] text-foreground-heading mb-[clamp(20px,4vw,40px)]">
              Was du mit dem Grünerator machen kannst
            </h2>
            <div className="grid grid-cols-[repeat(auto-fit,minmax(min(200px,45%),1fr))] gap-[clamp(12px,2vw,20px)] px-[clamp(12px,2vw,20px)] max-[1280px]:grid-cols-2 max-[900px]:grid-cols-2 max-md:grid-cols-1">
              {[
                {
                  icon: '\u270D\uFE0F',
                  title: 'Textgenerierung',
                  desc: 'Erstelle Pressemitteilungen, Social Media Posts und mehr mit KI-Unterstützung.',
                },
                {
                  icon: '\uD83D\uDDBC\uFE0F',
                  title: 'Sharepics',
                  desc: 'Generiere ansprechende Grafiken für Social Media mit deinen Texten.',
                },
                {
                  icon: '\uD83D\uDC65',
                  title: 'Kollaboration',
                  desc: 'Arbeite gemeinsam mit anderen an Texten in Echtzeit.',
                },
                {
                  icon: '\uD83D\uDCBE',
                  title: 'Offline-Modus',
                  desc: 'Nutze die Desktop-App auch ohne Internetverbindung.',
                },
              ].map((f) => (
                <div
                  key={f.title}
                  className="bg-gradient-to-br from-background to-background-alt border border-grey-200 dark:border-grey-700 rounded-2xl p-[24px] text-center transition-all duration-300 hover:-translate-y-1 hover:border-[var(--klee)] hover:shadow-lg max-[900px]:p-[18px]"
                >
                  <div className="text-[2.5rem] mb-[16px] max-[900px]:text-[2rem]">{f.icon}</div>
                  <h3 className="text-[1.1rem] text-foreground-heading mb-[8px] max-[480px]:text-base">
                    {f.title}
                  </h3>
                  <p className="text-[0.9rem] text-foreground opacity-80 leading-normal max-[480px]:text-[0.85rem]">
                    {f.desc}
                  </p>
                </div>
              ))}
            </div>
          </div>
        );

      case 'theme':
        return (
          <div className={cn('text-center p-[20px]', stepClass)}>
            <h2 className="text-[1.8rem] text-foreground-heading mb-[16px]">Wähle dein Design</h2>
            <p className="text-foreground opacity-80 mb-[40px]">
              Du kannst dies später in den Einstellungen ändern.
            </p>
            <div className="flex justify-center gap-[clamp(12px,2vw,20px)] flex-wrap max-md:flex-col max-md:items-center">
              {(['light', 'dark', 'auto'] as const).map((theme) => (
                <button
                  key={theme}
                  className={cn(
                    'w-[clamp(130px,15vw,160px)] p-[clamp(14px,2vw,20px)] rounded-2xl border-2 border-grey-300 bg-background cursor-pointer transition-all duration-300 hover:border-[var(--klee)] max-md:w-full max-md:max-w-[200px]',
                    selectedTheme === theme &&
                      'border-[var(--klee)] bg-background-alt shadow-[0_4px_16px_rgba(82,144,122,0.2)]'
                  )}
                  onClick={() => handleThemeSelect(theme)}
                >
                  <div
                    className={cn(
                      'w-full h-[80px] rounded-lg mb-[12px] flex items-center justify-center text-[1.5rem]',
                      theme === 'light' &&
                        'bg-gradient-to-br from-white to-[#F5F1E9] border border-[#dcdcdc]',
                      theme === 'dark' &&
                        'bg-gradient-to-br from-[#3d3d3d] to-[#262626] text-[#F5F1E9]',
                      theme === 'auto' && 'bg-gradient-to-br from-white to-[#262626]'
                    )}
                  >
                    {theme === 'light'
                      ? '\u2600\uFE0F'
                      : theme === 'dark'
                        ? '\uD83C\uDF19'
                        : '\uD83C\uDF13'}
                  </div>
                  <span className="font-semibold text-foreground">
                    {theme === 'light' ? 'Hell' : theme === 'dark' ? 'Dunkel' : 'Automatisch'}
                  </span>
                </button>
              ))}
            </div>
          </div>
        );

      case 'login':
        return (
          <div className={cn('text-center p-[20px]', stepClass)}>
            <h2 className="text-[1.8rem] text-foreground-heading mb-[16px]">
              Anmelden für mehr Funktionen
            </h2>
            <p className="text-foreground opacity-80 mb-[30px]">
              Melde dich an, um alle Vorteile zu nutzen.
            </p>
            <div className="max-w-[400px] mx-auto mb-[30px] text-left max-[900px]:max-w-full">
              {[
                { icon: '\u2601\uFE0F', text: 'Texte speichern und synchronisieren' },
                { icon: '\uD83D\uDCDD', text: 'Eigene Vorlagen erstellen' },
                { icon: '\uD83D\uDCF1', text: 'Auf allen Geräten verfügbar' },
              ].map((b) => (
                <div
                  key={b.text}
                  className="flex items-center gap-[12px] py-[12px] px-[16px] mb-[8px] bg-background-alt rounded-xl border-l-[3px] border-l-[var(--klee)]"
                >
                  <span className="text-[1.2rem]">{b.icon}</span>
                  <span className="text-foreground">{b.text}</span>
                </div>
              ))}
            </div>
            <div className="flex flex-col items-center gap-[12px]">
              <button
                className="py-[14px] px-[40px] rounded-[25px] text-base font-semibold cursor-pointer transition-all duration-300 border-none bg-gradient-to-br from-[var(--klee)] to-[var(--primary)] text-white shadow-[0_4px_12px_rgba(82,144,122,0.3)] hover:-translate-y-[2px] hover:shadow-[0_6px_16px_rgba(82,144,122,0.4)] max-[480px]:py-[12px] max-[480px]:px-[32px]"
                onClick={handleLogin}
              >
                Jetzt anmelden
              </button>
              <button
                className={cn(
                  'bg-transparent border-none text-foreground opacity-70 cursor-pointer text-[0.9rem] py-[8px] px-[16px] transition-opacity duration-200 hover:opacity-100',
                  requireLogin && 'hidden'
                )}
                onClick={handleSkipLogin}
              >
                Später anmelden
              </button>
            </div>
          </div>
        );

      case 'ready':
        return (
          <div className={cn('text-center py-[40px] px-[20px]', stepClass)}>
            <div className="w-[100px] h-[100px] mx-auto mb-[30px] bg-gradient-to-br from-[var(--klee)] to-[var(--primary)] rounded-full flex items-center justify-center animate-[checkmarkPop_0.5s_ease-out] max-[1024px]:w-[80px] max-[1024px]:h-[80px] max-md:w-[70px] max-md:h-[70px]">
              <svg
                viewBox="0 0 24 24"
                className="w-[50px] h-[50px] stroke-white stroke-[3] fill-none [stroke-dasharray:100] [stroke-dashoffset:100] animate-[checkmarkDraw_0.5s_ease-out_0.3s_forwards] max-[1024px]:w-[40px] max-[1024px]:h-[40px] max-md:w-[35px] max-md:h-[35px]"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <h2 className="text-[2rem] text-foreground-heading mb-[16px]">
              Grünerator ist bereit!
            </h2>
            <p className="text-foreground opacity-80 text-[1.1rem] mb-[30px]">
              Du kannst jetzt loslegen und deine ersten Texte erstellen.
            </p>
            <button
              className="py-[16px] px-[48px] rounded-[30px] text-[1.2rem] font-bold cursor-pointer transition-all duration-300 border-none bg-gradient-to-br from-[var(--klee)] to-[var(--primary)] text-white shadow-[0_6px_20px_rgba(82,144,122,0.35)] hover:-translate-y-[3px] hover:scale-[1.02] hover:shadow-[0_8px_25px_rgba(82,144,122,0.45)] max-md:py-[14px] max-md:px-[36px] max-md:text-[1.1rem]"
              onClick={onComplete}
            >
              Starten
            </button>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="fixed inset-0 z-[10000] flex flex-col bg-background bg-[radial-gradient(circle_at_5%_10%,rgba(82,144,122,0.1)_0%,transparent_15%),radial-gradient(circle_at_95%_90%,rgba(49,96,73,0.08)_0%,transparent_12%),radial-gradient(circle_at_90%_5%,rgba(95,133,117,0.06)_0%,transparent_8%)] overflow-hidden">
      <div className="flex-1 flex flex-col items-center justify-center p-[clamp(20px,4vw,40px)] overflow-y-auto">
        {renderStep()}
      </div>

      <div className="flex justify-center gap-[8px] p-[20px] bg-background-alt border-t border-grey-200 dark:border-grey-700">
        {STEPS.map((_, index) => (
          <div
            key={index}
            className={cn(
              'w-[10px] h-[10px] rounded-full bg-grey-300 transition-all duration-300',
              index === currentStep &&
                'bg-gradient-to-br from-[var(--klee)] to-[var(--primary)] scale-[1.2]',
              index < currentStep && 'bg-[var(--klee)]'
            )}
          />
        ))}
      </div>

      {currentStep < STEPS.length - 1 && STEPS[currentStep] !== 'login' && (
        <div className="flex justify-between p-[clamp(15px,3vw,20px)_clamp(20px,4vw,40px)] bg-background-alt border-t border-grey-200 dark:border-grey-700">
          <button
            className="py-[12px] px-[32px] rounded-[25px] text-base font-semibold cursor-pointer transition-all duration-300 border border-grey-300 bg-transparent text-foreground hover:bg-background hover:border-[var(--klee)] disabled:opacity-0 disabled:pointer-events-none max-[480px]:py-[10px] max-[480px]:px-[20px] max-[480px]:text-[0.9rem]"
            onClick={handleBack}
            disabled={currentStep === 0}
          >
            Zurück
          </button>
          <button
            className="py-[12px] px-[32px] rounded-[25px] text-base font-semibold cursor-pointer transition-all duration-300 border-none bg-gradient-to-br from-[var(--klee)] to-[var(--primary)] text-white shadow-[0_4px_12px_rgba(82,144,122,0.3)] hover:-translate-y-[2px] hover:shadow-[0_6px_16px_rgba(82,144,122,0.4)] max-[480px]:py-[10px] max-[480px]:px-[20px] max-[480px]:text-[0.9rem]"
            onClick={handleNext}
          >
            {currentStep === STEPS.length - 2 ? 'Fertig' : 'Weiter'}
          </button>
        </div>
      )}
    </div>
  );
}

export default FirstRunWizard;
