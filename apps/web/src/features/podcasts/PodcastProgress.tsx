import { type PodcastStatus } from '@gruenerator/contracts';
import { Check } from 'lucide-react';
import { useEffect, useState } from 'react';

import './podcastProgress.css';

import { formatAudioDuration } from '@/utils/formatAudioDuration';

type PendingStatus = Extract<PodcastStatus, 'queued' | 'scripting' | 'voicing'>;

const COPY: Record<PendingStatus, { headline: string; detail: string }> = {
  queued: {
    headline: 'Gleich geht’s los',
    detail: 'Dein Podcast steht in der Warteschlange.',
  },
  scripting: {
    headline: 'Das Skript entsteht',
    detail: 'Aus deinem Text wird ein Gespräch zwischen Moderation und Erklärung.',
  },
  voicing: {
    headline: 'Die Stimmen werden aufgenommen',
    detail: 'Das Skript ist fertig – du kannst es unten schon mitlesen.',
  },
};

const STEPS = ['Skript', 'Stimmen', 'Fertig'] as const;

/** Index of the step in progress; the queue counts as "about to write the script". */
const ACTIVE_STEP: Record<PendingStatus, number> = { queued: 0, scripting: 0, voicing: 1 };

const BAR_HEIGHTS = [0.55, 0.9, 0.7, 1, 0.6] as const;

function Equalizer() {
  return (
    <div aria-hidden="true" className="flex h-10 items-end gap-[3px]">
      {BAR_HEIGHTS.map((h, i) => (
        <span
          key={i}
          className="podcast-eq-bar w-[5px] rounded-full bg-secondary-600"
          style={{ height: `${h * 100}%`, animationDelay: `${i * 0.14}s` }}
        />
      ))}
    </div>
  );
}

function useElapsedSeconds(since: string): number {
  const start = new Date(since).getTime();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  return Math.max(0, (now - start) / 1000);
}

export function PodcastProgress({
  status,
  createdAt,
}: {
  status: PendingStatus;
  createdAt: string;
}) {
  const active = ACTIVE_STEP[status];
  const copy = COPY[status];
  const elapsed = useElapsedSeconds(createdAt);

  return (
    <div className="rounded-xl bg-background-alt p-md sm:p-lg">
      <div className="flex items-center gap-md">
        <Equalizer />
        {/* Only the step text is announced — the ticking clock would talk over everything. */}
        <div aria-live="polite" className="min-w-0">
          <p className="text-base font-semibold text-foreground-heading">{copy.headline}</p>
          <p className="mt-0.5 text-sm text-grey-500">{copy.detail}</p>
        </div>
      </div>

      <ol className="mt-lg flex items-center" aria-label="Fortschritt">
        {STEPS.map((label, i) => {
          const done = i < active;
          const current = i === active;
          return (
            <li key={label} className="flex flex-1 items-center last:flex-none">
              <div className="flex flex-col items-center gap-xs">
                <span
                  className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${
                    done
                      ? 'bg-secondary-600 text-white'
                      : current
                        ? 'podcast-step-active border-2 border-secondary-600 bg-background text-secondary-600'
                        : 'border border-grey-300 bg-background text-grey-500 dark:border-grey-600'
                  }`}
                  aria-hidden="true"
                >
                  {done ? <Check className="h-4 w-4" /> : i + 1}
                </span>
                <span
                  className={`text-xs ${current ? 'font-medium text-foreground' : 'text-grey-500'}`}
                >
                  {label}
                  <span className="sr-only">
                    {done ? ' – erledigt' : current ? ' – läuft' : ' – ausstehend'}
                  </span>
                </span>
              </div>
              {i < STEPS.length - 1 && (
                <span
                  aria-hidden="true"
                  className={`mx-xs mb-5 h-0.5 flex-1 rounded-full ${
                    done ? 'bg-secondary-600' : 'bg-grey-200 dark:bg-grey-700'
                  }`}
                />
              )}
            </li>
          );
        })}
      </ol>

      <p className="mt-lg border-t border-grey-200 pt-sm text-xs text-grey-500 dark:border-grey-700">
        <span className="tabular-nums">Läuft seit {formatAudioDuration(elapsed)}</span> · meist ein
        bis drei Minuten. Du kannst den Tab schließen – der Podcast landet auch in deiner Mediathek.
      </p>
    </div>
  );
}
