import { Button } from '@gruenerator/ui';
import { type QueryClient } from '@tanstack/react-query';
import { Check } from 'lucide-react';
import { useState, type ComponentType } from 'react';

import { useOnboarding } from '../useOnboarding';

import BackgroundTab from './BackgroundTab';
import FriendsTab, { prefetch as prefetchFriends } from './FriendsTab';
import RolesSection from './RolesSection';

import { userDefaultsQuery } from '@/features/user-defaults/userDefaultsQueries';
import { cn } from '@/utils/cn';

/**
 * Die einmalige Einrichtung — der erste Bereich der Einstellungen, und der
 * einzige, der wieder verschwindet.
 *
 * Die drei Schritte rendern die Bereiche, die es ohnehin gibt (Rollen,
 * Friends, Hintergrund), statt eigene Kurzfassungen davon. Eine zweite,
 * schlankere Rollenauswahl neben der echten wäre genau die Art Zweitkopie, die
 * still veraltet: Was in „Personalisierung" dazukommt, wäre in der Einrichtung
 * nicht da, und niemand würde es merken.
 *
 * Jeder Schritt speichert für sich, sofort — die Einrichtung sammelt nichts ein,
 * was sie am Ende gemeinsam wegschreiben müsste. Deshalb kostet Überspringen
 * auch nichts: Was schon gesetzt ist, bleibt stehen, und der Rest behält seinen
 * Standard.
 */

export const prefetch = (queryClient: QueryClient) => {
  // Schritt 2 zieht Profil und Wolke-Freigaben, Schritt 1 die Rollen.
  prefetchFriends(queryClient);
  void queryClient.prefetchQuery(userDefaultsQuery);
};

interface OnboardingStep {
  id: string;
  title: string;
  description: string;
  Body: ComponentType;
}

const STEPS: OnboardingStep[] = [
  {
    id: 'rolle',
    title: 'Was machst du bei den Grünen?',
    description:
      'Deine Rolle sagt dem Grünerator, für wen er schreibt — Ebene, Gliederung und Amt bestimmen Ansprache, Quellen und Beispiele.',
    Body: RolesSection,
  },
  {
    id: 'friend',
    title: 'Wer vertritt dich?',
    description: 'Dein Friend wird dein Profilbild in Chats, Projekten und Kommentaren.',
    Body: () => <FriendsTab starterOnly />,
  },
  {
    id: 'hintergrund',
    title: 'Wie soll deine Startseite aussehen?',
    description: 'Der farbige Schimmer hinter dem Chat-Start — und der Senden-Button darauf.',
    Body: BackgroundTab,
  },
];

const OnboardingTab = () => {
  const [stepIndex, setStepIndex] = useState(0);
  const { complete } = useOnboarding();

  const step = STEPS[stepIndex];
  const isLast = stepIndex === STEPS.length - 1;

  // Weiter und Überspringen tun dasselbe: eine Position vor, am Ende fertig.
  // Der Unterschied liegt allein in der Beschriftung — es gibt nichts zu
  // bestätigen, weil jeder Schritt beim Klick schon gespeichert hat.
  const advance = () => {
    if (isLast) complete();
    else setStepIndex(stepIndex + 1);
  };

  return (
    <div className="flex flex-col gap-lg">
      <div className="flex flex-wrap items-center gap-sm">
        <ol className="m-0 flex list-none items-center gap-xs p-0">
          {STEPS.map((s, i) => (
            <li key={s.id} className="flex items-center gap-xs">
              <span
                aria-current={i === stepIndex ? 'step' : undefined}
                className={cn(
                  'flex size-6 items-center justify-center rounded-full text-xs font-semibold transition-colors',
                  i < stepIndex && 'bg-primary-500/15 text-primary-600 dark:text-primary-400',
                  i === stepIndex && 'bg-primary-500 text-white',
                  i > stepIndex && 'bg-grey-100 text-grey-500 dark:bg-grey-800 dark:text-grey-400'
                )}
              >
                {i < stepIndex ? <Check className="size-3.5" aria-hidden /> : i + 1}
                <span className="sr-only">
                  {s.title}
                  {i < stepIndex ? ' (erledigt)' : ''}
                </span>
              </span>
              {i < STEPS.length - 1 && (
                <span
                  aria-hidden
                  className={cn(
                    'h-px w-5',
                    i < stepIndex ? 'bg-primary-500/40' : 'bg-grey-200 dark:bg-grey-700'
                  )}
                />
              )}
            </li>
          ))}
        </ol>
      </div>

      <div>
        <h2 className="m-0 text-lg font-semibold text-foreground-heading">{step.title}</h2>
        <p className="m-0 mt-1 max-w-prose text-sm text-grey-500 dark:text-grey-400">
          {step.description}
        </p>
      </div>

      <step.Body />

      <div className="flex items-center justify-between gap-sm border-t border-grey-200 pt-lg dark:border-grey-800">
        <Button
          type="button"
          variant="ghost"
          onClick={() => setStepIndex(stepIndex - 1)}
          disabled={stepIndex === 0}
        >
          Zurück
        </Button>
        <div className="flex items-center gap-sm">
          <Button type="button" variant="ghost" onClick={advance}>
            Überspringen
          </Button>
          <Button type="button" onClick={advance}>
            {isLast ? 'Fertig' : 'Weiter'}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default OnboardingTab;
