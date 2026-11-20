import { ApiError, getContractsClient } from '@gruenerator/shared/api';
import { NEWSLETTER_SIGNUP_URL } from '@gruenerator/shared/links';
import { Button, cn } from '@gruenerator/ui';
import { useMutation } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';

import { DASH_CARD } from '../../../components/dashboard/dashboardStyles';
import { useTreeBudget } from '../../../hooks/useTreeBudget';
import { useAuthStore } from '../../../stores/authStore';

import { ArbeitenSection } from './ArbeitenSections';

// Per-viewer convenience: someone who hid the card doesn't see it again in this browser.
const HIDDEN_KEY = 'gruenerator:arbeiten-newsletter-hidden';

const readHidden = (): boolean => {
  try {
    return localStorage.getItem(HIDDEN_KEY) === '1';
  } catch {
    return false;
  }
};

// The Briefing's neutral card: white, hairline border, soft shadow (dashboardTokens.css).
const CARD = cn('rounded-2xl p-6 md:rounded-[20px]', DASH_CARD);

const FALLBACK_LINK =
  'text-inherit underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600';

async function subscribe() {
  const result = await getContractsClient().newsletter.subscribe();
  if (result.status === 200 || result.status === 202) return result.body.status;
  const message =
    result.status === 422 || result.status === 502 || result.status === 503 || result.status === 500
      ? result.body.error
      : 'Die Anmeldung ist gerade nicht möglich.';
  throw new ApiError(result.status, message);
}

/**
 * „Grünerator-Newsletter" on the Arbeiten tab: one click starts the double opt-in with the
 * account address. Hidden for subscribers (tree bonus active), while the budget loads, and
 * once dismissed.
 */
export function NewsletterSection() {
  const [hidden, setHidden] = useState(readHidden);
  const email = useAuthStore((s) => s.user?.email) ?? null;
  const { data: budget } = useTreeBudget();
  const [searchParams, setSearchParams] = useSearchParams();
  const mutation = useMutation({ mutationFn: subscribe });

  // Brevo's confirmation link lands here: thank once, then drop the parameter.
  useEffect(() => {
    if (searchParams.get('newsletter') !== 'bestaetigt') return;
    toast.success('Danke, du bekommst jetzt den Grünerator-Newsletter.');
    const next = new URLSearchParams(searchParams);
    next.delete('newsletter');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  // Not before the budget is known: a subscriber would otherwise see the card flash.
  if (hidden || !budget || budget.newsletterBonus) return null;

  const hide = () => {
    try {
      localStorage.setItem(HIDDEN_KEY, '1');
    } catch {
      // Storage blocked: hide for this visit only.
    }
    setHidden(true);
  };

  const status = mutation.data ?? null;

  return (
    <ArbeitenSection
      title="Newsletter"
      action={
        <button
          type="button"
          onClick={hide}
          className="touch-target cursor-pointer border-0 bg-transparent p-0 text-sm text-muted-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600"
        >
          Ausblenden
        </button>
      }
    >
      <div className="dashboard-surface dashboard-neutral">
        <div className={CARD}>
          <h3 className="m-0 text-2xl font-bold leading-tight text-foreground-heading">
            Grünerator-Newsletter
          </h3>
          <p className="m-0 mt-1.5 text-base text-(--dash-mg-sub)">
            Neuigkeiten und neue Funktionen direkt in dein Postfach. Mit dem Newsletter bekommst du
            täglich 15 statt 10 Bäume.
          </p>

          <div className="mt-4" aria-live="polite">
            {status === 'confirmation_sent' && (
              <p role="status" className="m-0 text-base font-semibold text-foreground-heading">
                Fast geschafft: Bitte bestätige die Mail{email ? ` an ${email}` : ''}.
              </p>
            )}
            {status === 'already_subscribed' && (
              <p role="status" className="m-0 text-base font-semibold text-foreground-heading">
                Du bekommst den Newsletter schon.
              </p>
            )}
            {mutation.isError && (
              <p role="alert" className="m-0 text-sm text-(--dash-mg-sub)">
                {mutation.error.message}{' '}
                <a
                  href={NEWSLETTER_SIGNUP_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={FALLBACK_LINK}
                >
                  Formular öffnen
                </a>
              </p>
            )}
          </div>

          {!status && (
            <div className="mt-4">
              <Button
                variant="brand"
                size="lg"
                onClick={() => mutation.mutate()}
                disabled={mutation.isPending}
              >
                {mutation.isPending
                  ? 'Wird gesendet …'
                  : mutation.isError
                    ? 'Erneut versuchen'
                    : 'Newsletter abonnieren'}
              </Button>
              <p className="m-0 mt-3 max-w-xl text-[12.5px] text-(--dash-mg-sub)">
                {email && <>Wir nutzen deine Adresse {email}. </>}
                Mit dem Klick bekommst du eine Bestätigungs-Mail. Erst nach deiner Bestätigung bist
                du angemeldet.{' '}
                <Link to="/datenschutz" className={FALLBACK_LINK}>
                  Datenschutz
                </Link>
              </p>
            </div>
          )}
        </div>
      </div>
    </ArbeitenSection>
  );
}
