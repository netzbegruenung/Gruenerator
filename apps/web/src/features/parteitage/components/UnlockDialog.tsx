import { Button, Input } from '@gruenerator/ui';
import { useId, useState, type FormEvent } from 'react';
import {
  HiOutlineChartBar,
  HiOutlineLockClosed,
  HiOutlinePlay,
  HiOutlineScissors,
} from 'react-icons/hi2';

import { type UnlockOutcome } from '../hooks/useParteitage';

const ERRORS: Record<Exclude<UnlockOutcome, 'ok'>, string> = {
  wrong_password: 'Das Passwort stimmt nicht.',
  rate_limited: 'Zu viele Versuche, bitte versuche es später erneut.',
  error: 'Das Entsperren hat nicht geklappt. Bitte versuche es erneut.',
};

const BENEFITS = [
  [<HiOutlinePlay key="p" />, 'Bewerbungsreden als fertig geschnittene Hochformat-Reels.'],
  [
    <HiOutlineScissors key="s" />,
    'Jede Rede lässt sich mit Untertiteln im Video Editor weiterbearbeiten.',
  ],
  [<HiOutlineChartBar key="c" />, 'Eine Auswertung der Reden nach Herkunft der Kreisverbände.'],
] as const;

interface UnlockDialogProps {
  title: string;
  busy: boolean;
  onUnlock: (password: string) => Promise<UnlockOutcome>;
  onCancel: () => void;
}

export function UnlockDialog({ title, busy, onUnlock, onCancel }: UnlockDialogProps) {
  const inputId = useId();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!password || busy) return;
    setError(null);
    const outcome = await onUnlock(password);
    if (outcome !== 'ok') setError(ERRORS[outcome]);
  };

  return (
    <div className="grid items-start gap-lg md:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
      <form
        onSubmit={submit}
        className="flex flex-col gap-md rounded-lg border border-grey-200 bg-background p-md dark:border-grey-700"
      >
        <div className="flex flex-col gap-xs">
          <h2 className="m-0 flex items-center gap-2 text-lg font-bold text-foreground-heading">
            <HiOutlineLockClosed aria-hidden="true" />
            {title}
          </h2>
          <p className="m-0 text-sm text-foreground-muted">
            Dieser Parteitag ist passwortgeschützt. Gib das Passwort ein, um die Reden zu sehen.
          </p>
        </div>
        <div className="flex flex-col gap-xs">
          <label htmlFor={inputId} className="text-sm font-medium text-foreground">
            Passwort
          </label>
          <Input
            id={inputId}
            type="password"
            autoComplete="off"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-invalid={error !== null}
            className={error ? 'ring-2 ring-error' : undefined}
          />
          {error ? (
            <p role="alert" className="m-0 rounded-sm bg-error-bg px-sm py-xs text-sm text-error">
              {error}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-sm">
          <Button
            type="submit"
            variant="brand"
            size="brand"
            disabled={!password || busy}
            className="flex-1"
          >
            Entsperren
          </Button>
          <Button type="button" variant="brand-outline" size="brand" onClick={onCancel}>
            Abbrechen
          </Button>
        </div>
      </form>
      <aside className="flex flex-col gap-sm md:pt-md">
        <h2 className="m-0 text-base font-semibold text-foreground-heading">
          Das wartet hinter dem Passwort
        </h2>
        <ul className="m-0 flex max-w-[34rem] list-none flex-col gap-sm p-0 text-sm text-foreground-muted">
          {BENEFITS.map(([icon, text]) => (
            <li key={text} className="flex gap-2">
              <span
                aria-hidden="true"
                className="mt-0.5 flex shrink-0 text-base text-primary-600 dark:text-primary-300"
              >
                {icon}
              </span>
              {text}
            </li>
          ))}
        </ul>
      </aside>
    </div>
  );
}
