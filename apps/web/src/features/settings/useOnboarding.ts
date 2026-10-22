/**
 * Ob der Bereich „Onboarding" in der Seitenleiste der Einstellungen steht.
 *
 * Der Bereich ist der einzige, der wieder verschwindet: Er richtet einmalig
 * Rolle, Friend und Hintergrund ein und ist danach erledigt. Zurückholen lässt
 * er sich über die Zeile „Einrichtung erneut starten" in Allgemein.
 *
 * Solange die User-Defaults nicht geladen sind — noch nicht, oder weil der Abruf
 * scheiterte —, gilt der Bereich als nicht aktiv. Der umgekehrte Default würde
 * jedem Bestandskonto den Bereich einblenden und dann wieder wegnehmen — ein
 * Reiter, der aufblitzt und verschwindet, liest sich als Fehler.
 *
 * Am Fehlerfall hängt mehr als die Optik: Jeder neue Abruf einer gescheiterten
 * Abfrage ohne Daten setzt sie auf `pending` zurück. Hing `isActive` daran,
 * kippte es mit jedem Abruf — und der Vorabruf der Einstellungen, der an
 * `isActive` hängt und selbst die User-Defaults abruft, lief im Kreis (#4846).
 */
import { toast } from '@gruenerator/ui';

import { useSetUserDefault, useUserDefault } from '@/features/user-defaults/userDefaultsQueries';

interface OnboardingState {
  /** Der Bereich wird gerendert und die Einrichtung ist offen. */
  isActive: boolean;
  /** Merkt den Abschluss vor — auch das Überspringen zählt als erledigt. */
  complete: () => void;
  /** Holt den Bereich zurück (Allgemein → „Einrichtung erneut starten"). */
  restart: () => void;
}

export function useOnboarding(): OnboardingState {
  const { value, isLoaded } = useUserDefault('profile', 'onboardingCompleted');
  const setOnboarding = useSetUserDefault<'profile', 'onboardingCompleted'>();

  // Ohne eigenes onError bliebe ein Fehlschlag unsichtbar: useSetUserDefault
  // nimmt den optimistischen Wert nur wieder zurück. Die Einrichtung sähe
  // erledigt aus und stünde beim nächsten Laden wieder da — ohne dass irgendwo
  // etwas von einem Fehler stünde.
  const set = (completed: boolean) => {
    setOnboarding.mutate(
      { generator: 'profile', key: 'onboardingCompleted', value: completed },
      {
        onError: () =>
          toast.error(
            completed
              ? 'Abschluss konnte nicht gespeichert werden — die Einrichtung erscheint beim nächsten Öffnen wieder.'
              : 'Einrichtung konnte nicht neu gestartet werden.'
          ),
      }
    );
  };

  return {
    isActive: isLoaded && value !== true,
    complete: () => set(true),
    restart: () => set(false),
  };
}
