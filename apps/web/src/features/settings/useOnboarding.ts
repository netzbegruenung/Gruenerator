/**
 * Ob der Bereich „Onboarding" in der Seitenleiste der Einstellungen steht.
 *
 * Der Bereich ist der einzige, der wieder verschwindet: Er richtet einmalig
 * Rolle, Friend und Hintergrund ein und ist danach erledigt. Zurückholen lässt
 * er sich über die Zeile „Einrichtung erneut starten" in Allgemein.
 *
 * Solange die User-Defaults noch laden, gilt der Bereich als nicht aktiv. Der
 * umgekehrte Default würde jedem Bestandskonto den Bereich für einen Wimpernschlag
 * einblenden und dann wieder wegnehmen — ein Reiter, der aufblitzt und
 * verschwindet, liest sich als Fehler.
 */
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
  const { value, isPending } = useUserDefault('profile', 'onboardingCompleted');
  const setOnboarding = useSetUserDefault<'profile', 'onboardingCompleted'>();

  const set = (completed: boolean) => {
    setOnboarding.mutate({ generator: 'profile', key: 'onboardingCompleted', value: completed });
  };

  return {
    isActive: !isPending && value !== true,
    complete: () => set(true),
    restart: () => set(false),
  };
}
