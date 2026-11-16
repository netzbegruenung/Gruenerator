import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
} from '@gruenerator/ui';
import { useId, useState, type FormEvent } from 'react';

import { type UnlockOutcome } from '../hooks/useParteitage';

const ERRORS: Record<Exclude<UnlockOutcome, 'ok'>, string> = {
  wrong_password: 'Das Passwort stimmt nicht.',
  rate_limited: 'Zu viele Versuche, bitte versuche es später erneut.',
  error: 'Das Entsperren hat nicht geklappt. Bitte versuche es erneut.',
};

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
    <Dialog open onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="bg-background-pure">
        <form onSubmit={submit} className="flex flex-col gap-md">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>
              Dieser Parteitag ist passwortgeschützt. Gib das Passwort ein, um die Reden zu sehen.
            </DialogDescription>
          </DialogHeader>
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
            />
            {error ? (
              <p role="alert" className="m-0 text-sm text-error">
                {error}
              </p>
            ) : null}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onCancel}>
              Abbrechen
            </Button>
            <Button type="submit" disabled={!password || busy}>
              Entsperren
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
