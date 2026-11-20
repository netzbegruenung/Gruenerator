import { ApiError, getContractsClient } from '@gruenerator/shared/api';
import { NEWSLETTER_SIGNUP_URL } from '@gruenerator/shared/links';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  cn,
} from '@gruenerator/ui';
import { useMutation } from '@tanstack/react-query';
import { useId, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';

import { useAuthStore } from '../../../stores/authStore';

import { SIDE_CARD } from './sideCards';

const INLINE_LINK =
  'text-inherit underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600';

async function subscribe(email: string) {
  const result = await getContractsClient().newsletter.subscribe({ body: { email } });
  if (result.status === 200 || result.status === 202) return result.body.status;
  const message =
    result.status === 422 || result.status === 502 || result.status === 503 || result.status === 500
      ? result.body.error
      : 'Die Anmeldung ist gerade nicht möglich.';
  throw new ApiError(result.status, message);
}

// Real issues from the archive (documentation/docs/sonstiges/archiv/newsletter), newest first.
const ISSUES = [
  { subject: 'Neue Sharepics & Europa ist zurück', when: 'Okt.' },
  { subject: 'Das Herbst-Update', when: 'Sep.' },
] as const;

const MAIL =
  'flex items-center gap-3 rounded-2xl border border-(--dash-card-border) bg-white px-3.5 py-3 ' +
  'shadow-[0_12px_24px_-14px_rgba(16,40,26,0.35)] transition-transform duration-300 ease-out ' +
  'hover:-translate-y-1 motion-reduce:transition-none dark:bg-(--dash-card)';

/** Two past issues as stacked inbox notifications; each lifts on its own when hovered. */
function MailStack() {
  return (
    <ul aria-hidden className="m-0 flex list-none flex-col gap-2 p-0">
      {ISSUES.map((issue, i) => (
        <li key={issue.subject} className={cn(MAIL, i === 1 && 'ml-4')}>
          <img src="/logo192.png" alt="" className="size-8 shrink-0 rounded-lg" />
          <span className="min-w-0 flex-1">
            <span className="flex items-baseline justify-between gap-2 text-[11.5px] text-(--dash-mg-sub)">
              <span className="font-semibold text-foreground-heading">Grünerator</span>
              {issue.when}
            </span>
            <span className="block truncate text-[13px] text-foreground-heading">
              {issue.subject}
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Starts the double opt-in; the dialog confirms the address (prefilled with the account's). */
export function NewsletterCard() {
  const accountEmail = useAuthStore((s) => s.user?.email) ?? '';
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState(accountEmail);
  const mutation = useMutation({ mutationFn: subscribe });
  const status = mutation.data ?? null;
  const inputId = useId();

  const submit = (e: FormEvent) => {
    e.preventDefault();
    mutation.mutate(email.trim(), { onSuccess: () => setOpen(false) });
  };

  return (
    <div className={cn('relative flex flex-col p-6 xl:p-10', SIDE_CARD)}>
      <h3 className="m-0 text-2xl font-bold leading-tight text-foreground-heading md:text-[28px]">
        Newsletter
      </h3>
      <p className="m-0 mt-1.5 text-base text-(--dash-mg-sub)">
        Neue Funktionen direkt ins Postfach.
      </p>

      <div className="my-6 flex flex-1 flex-col justify-center">
        <MailStack />
      </div>

      <div aria-live="polite">
        {status === 'confirmation_sent' && (
          <p role="status" className="m-0 text-base font-semibold text-foreground-heading">
            Fast geschafft: Bitte bestätige die Mail an {mutation.variables}.
          </p>
        )}
        {status === 'already_subscribed' && (
          <p role="status" className="m-0 text-base font-semibold text-foreground-heading">
            Du bekommst den Newsletter schon.
          </p>
        )}
      </div>

      {!status && (
        <Button variant="brand" size="lg" className="self-start" onClick={() => setOpen(true)}>
          Newsletter abonnieren
        </Button>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={submit} className="flex flex-col gap-4">
            <DialogHeader>
              <DialogTitle>Newsletter abonnieren</DialogTitle>
              <DialogDescription>
                Wir schicken dir eine Bestätigungs-Mail. Erst nach deiner Bestätigung bist du
                angemeldet.{' '}
                <Link to="/datenschutz" className={INLINE_LINK}>
                  Datenschutz
                </Link>
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={inputId}>E-Mail-Adresse</Label>
              <Input
                id={inputId}
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              {accountEmail && email.trim().toLowerCase() !== accountEmail.toLowerCase() && (
                <p className="m-0 text-xs text-muted-foreground">
                  Die 5 Bäume mehr gibt es nur für die Adresse deines Kontos.
                </p>
              )}
            </div>
            {mutation.isError && (
              <p role="alert" className="m-0 text-sm text-destructive">
                {mutation.error.message}{' '}
                <a
                  href={NEWSLETTER_SIGNUP_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={INLINE_LINK}
                >
                  Formular öffnen
                </a>
              </p>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Abbrechen
              </Button>
              <Button type="submit" variant="brand" disabled={mutation.isPending}>
                {mutation.isPending ? 'Wird gesendet …' : 'Bestätigungs-Mail senden'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
