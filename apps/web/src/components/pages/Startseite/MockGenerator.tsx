import { useInView } from 'motion/react';
import { memo, useEffect, useRef } from 'react';

const USER_MESSAGE = 'Schreibe eine Pressemitteilung zum Thema Klimaschutz in unserer Kommune.';

const AI_RESPONSE =
  'Die Grüne Fraktion begrüßt das heute vorgestellte kommunale Klimaschutzpaket als wichtigen Schritt für eine lebenswerte Stadt.\n\n„Mit diesem Paket setzen wir ein klares Zeichen: Klimaschutz beginnt vor Ort", erklärt die Fraktionsvorsitzende. „Die Maßnahmen zur energetischen Gebäudesanierung und zum Ausbau erneuerbarer Energien sind längst überfällig."\n\nDas Paket umfasst unter anderem ein Förderprogramm für Balkonkraftwerke, kostenlose Energieberatung für alle Haushalte sowie eine Verdopplung der Mittel für Gebäudesanierung.';

const CHAR_INTERVAL_MS = 18;

const SunflowerIcon = memo(function SunflowerIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5 text-secondary-600">
      <circle cx="12" cy="12" r="4" fill="currentColor" />
      {[0, 45, 90, 135, 180, 225, 270, 315].map((angle) => (
        <ellipse
          key={angle}
          cx="12"
          cy="5"
          rx="2.2"
          ry="3.5"
          fill="currentColor"
          opacity="0.7"
          transform={`rotate(${angle} 12 12)`}
        />
      ))}
    </svg>
  );
});

const MockGenerator = memo(function MockGenerator() {
  const containerRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const cursorRef = useRef<HTMLSpanElement>(null);
  const responseRef = useRef<HTMLDivElement>(null);
  const isInView = useInView(containerRef, { once: true, amount: 0.3 });

  useEffect(() => {
    if (!isInView) return;

    let rafId: number | null = null;
    let charIndex = 0;
    let lastTime = 0;

    const startTyping = () => {
      if (responseRef.current) responseRef.current.hidden = false;

      const tick = (now: number) => {
        if (charIndex >= AI_RESPONSE.length) {
          if (cursorRef.current) cursorRef.current.hidden = true;
          return;
        }

        if (now - lastTime >= CHAR_INTERVAL_MS) {
          charIndex++;
          if (textRef.current) {
            textRef.current.textContent += AI_RESPONSE[charIndex - 1];
          }
          lastTime = now;
        }

        rafId = requestAnimationFrame(tick);
      };

      rafId = requestAnimationFrame(tick);
    };

    const timeout = setTimeout(startTyping, 800);

    return () => {
      clearTimeout(timeout);
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [isInView]);

  return (
    <div
      ref={containerRef}
      className="w-full h-full flex items-center justify-center p-2 md:p-sm lg:p-md"
    >
      <div className="w-full max-w-[500px] rounded-xl border border-grey-200 dark:border-grey-700 bg-background shadow-[0_8px_24px_rgba(0,0,0,0.12)] overflow-hidden flex flex-col">
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-grey-200 dark:border-grey-700 bg-grey-50 dark:bg-grey-800/50">
          <SunflowerIcon />
          <span className="text-xs font-semibold text-foreground">Grünerator Chat</span>
        </div>

        <div className="flex-1 px-4 py-4 flex flex-col gap-4 max-h-[300px] md:max-h-[360px] overflow-hidden relative">
          <div className="flex justify-end">
            <div className="max-w-[80%] rounded-2xl rounded-tr-sm bg-primary-500 text-white px-3.5 py-2.5 text-xs leading-relaxed">
              {USER_MESSAGE}
            </div>
          </div>

          <div ref={responseRef} className="flex gap-2.5 items-start" hidden>
            <div className="shrink-0 w-7 h-7 rounded-full bg-secondary-100 dark:bg-secondary-900/30 flex items-center justify-center">
              <SunflowerIcon />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xs leading-relaxed text-foreground whitespace-pre-line">
                <span ref={textRef} />
                <span
                  ref={cursorRef}
                  className="inline-block w-[2px] h-3.5 bg-foreground ml-0.5 align-text-bottom animate-pulse"
                />
              </div>
            </div>
          </div>

          <div className="absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-background to-transparent pointer-events-none" />
        </div>

        <div className="px-4 pb-3">
          <div className="flex items-center gap-2 rounded-xl border border-grey-200 dark:border-grey-700 bg-grey-50 dark:bg-grey-800/30 px-3.5 py-2.5">
            <span className="text-xs text-grey-400 dark:text-grey-500 flex-1">
              Nachricht eingeben...
            </span>
            <div className="w-6 h-6 rounded-lg bg-primary-500 flex items-center justify-center">
              <svg viewBox="0 0 24 24" fill="none" className="w-3.5 h-3.5 text-white">
                <path
                  d="M5 12h14M12 5l7 7-7 7"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});

export default MockGenerator;
