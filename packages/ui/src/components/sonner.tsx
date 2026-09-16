import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
} from 'lucide-react';
import { useSyncExternalStore } from 'react';
import { Toaster as Sonner, type ToasterProps } from 'sonner';

// sonners Rich-Colors erreichen im HELLEN Satz KEINE der vier Textfarben
// 4,5:1 auf ihrem eigenen Grund (WCAG 1.4.3): Erfolg 4,26:1, Info 4,35:1,
// Warnung 3,08:1, Fehler 4,35:1. Gemessen an einer Probe im echten Stylesheet,
// nicht gerechnet. Nur die Helligkeit ist abgesenkt, Farbton und Sättigung
// bleiben — deshalb stehen die Werte weiter als `hsl()` da, mit sonners
// Originalzahl im Kommentar.
//
// Sie gelten ausschließlich hell. Der dunkle Satz braucht sie nicht (6,56 bis
// 12,3:1) und verträgt sie auch nicht: dort ist der Grund fast schwarz (Erfolg
// `hsl(150, 100%, 6%)`) und sonners eigene Schrift hell. Diese dunklen Werte
// darüber gelegt ergäben dunkel auf dunkel.
const LIGHT_RICH_COLOR_TEXT = {
  '--success-text': 'hsl(140, 100%, 25.5%)' /* war 27% — 4,26 → 4,71:1 */,
  '--info-text': 'hsl(210, 92%, 43.5%)' /* war 45% — 4,35 → 4,61:1 */,
  '--warning-text': 'hsl(31, 92%, 35.5%)' /* war 45% — 3,08 → 4,68:1 */,
  '--error-text': 'hsl(360, 100%, 43.5%)' /* war 45% — 4,35 → 4,62:1 */,
} as const;

const DARK_QUERY = '(prefers-color-scheme: dark)';
const subscribeToOsTheme = (onChange: () => void): (() => void) => {
  const query = window.matchMedia(DARK_QUERY);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
};
const osPrefersDark = (): boolean => window.matchMedia(DARK_QUERY).matches;

const Toaster = ({ theme = 'light', ...props }: ToasterProps) => {
  // Bei `theme="system"` liest sonner die Betriebssystem-Einstellung. Die
  // Fallunterscheidung unten muss dieselbe Antwort bekommen, sonst liegt der
  // helle Satz über einem dunklen Hinweisfeld.
  const osDark = useSyncExternalStore(subscribeToOsTheme, osPrefersDark, () => false);
  const isDark = theme === 'dark' || (theme === 'system' && osDark);

  return (
    <Sonner
      className="toaster group"
      theme={theme}
      icons={{
        success: <CircleCheckIcon className="size-4" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4" />,
        error: <OctagonXIcon className="size-4" />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      style={
        {
          // `--popover`, `--popover-foreground` und `--border` sind in dieser
          // App nirgends definiert — es greift also immer der Rückfall, und der
          // muss eine FARBE sein. `--border-subtle` ist eine Kurzschreibweise
          // für den ganzen Rand (`1px solid rgba(…)`) und fällt als
          // `border-color` ersatzlos weg; `--border-color` ist in allen drei
          // Farbblöcken von variables.css eine echte Farbe.
          '--normal-bg': 'var(--popover, var(--background-color))',
          '--normal-text': 'var(--popover-foreground, var(--font-color))',
          '--normal-border': 'var(--border, var(--border-color))',
          // Warum inline und nicht im Stylesheet: sonner spritzt seine Styles
          // zur Laufzeit in den `<head>`, also NACH jedem verlinkten
          // Stylesheet. Eine Regel gleicher Spezifität verliert damit. Eine
          // Custom Property am Element selbst gewinnt immer — und zwar in
          // BEIDEN Sätzen, was die Fallunterscheidung oben nötig macht.
          ...(isDark ? null : LIGHT_RICH_COLOR_TEXT),
        } as React.CSSProperties
      }
      {...props}
    />
  );
};

export { Toaster };
