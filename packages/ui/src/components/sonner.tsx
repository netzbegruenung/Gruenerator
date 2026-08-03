import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
} from 'lucide-react';
import { Toaster as Sonner, type ToasterProps } from 'sonner';

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      className="toaster group"
      icons={{
        success: <CircleCheckIcon className="size-4" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4" />,
        error: <OctagonXIcon className="size-4" />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      style={
        {
          '--normal-bg': 'var(--popover, var(--background-color))',
          '--normal-text': 'var(--popover-foreground, var(--font-color))',
          '--normal-border': 'var(--border, var(--border-subtle))',
          // sonners Rich-Colors erreichen im hellen Satz KEINE der vier
          // Textfarben 4,5:1 auf ihrem eigenen Grund (WCAG 1.4.3):
          // Erfolg 4,26:1, Info 4,35:1, Warnung 3,08:1, Fehler 4,35:1.
          // Gemessen an einer Probe im echten Stylesheet, nicht gerechnet.
          //
          // Nur die Helligkeit ist abgesenkt, Farbton und Sättigung bleiben —
          // deshalb stehen die Werte weiter als `hsl()` da, mit sonners
          // Originalzahl im Kommentar.
          //
          // Warum hier inline und nicht im Stylesheet: sonner spritzt seine
          // Styles zur Laufzeit in den `<head>`, also NACH jedem verlinkten
          // Stylesheet. Eine Regel gleicher Spezifität verliert damit. Eine
          // Custom Property am Element selbst gewinnt immer.
          //
          // Warum nur der helle Satz: wir übergeben kein `theme`, und sonners
          // Vorgabe ist `'light'` — `data-sonner-theme` steht also IMMER auf
          // hell, auch bei dunkler Oberfläche. Der dunkle Satz wird nie
          // benutzt (er läge mit 6,56 bis 12,3:1 ohnehin gut). Dass dunkle
          // Nutzeroberflächen deshalb helle Hinweisfelder bekommen, ist ein
          // eigener Befund — eine Gestaltungsfrage, kein Kontrastverstoß.
          '--success-text': 'hsl(140, 100%, 25.5%)' /* war 27% — 4,26 → 4,71:1 */,
          '--info-text': 'hsl(210, 92%, 43.5%)' /* war 45% — 4,35 → 4,61:1 */,
          '--warning-text': 'hsl(31, 92%, 35.5%)' /* war 45% — 3,08 → 4,68:1 */,
          '--error-text': 'hsl(360, 100%, 43.5%)' /* war 45% — 4,35 → 4,62:1 */,
        } as React.CSSProperties
      }
      {...props}
    />
  );
};

export { Toaster };
