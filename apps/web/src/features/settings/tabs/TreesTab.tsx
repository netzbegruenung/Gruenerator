/**
 * "Bäume" — the daily budget shared by images, Grünerator Voice, translation
 * and deep research (see apps/web/src/hooks/useTreeBudget.ts).
 */
import { Button } from '@gruenerator/ui';
import { type QueryClient } from '@tanstack/react-query';

import { formatTrees } from '../../../components/common/TreeBudgetLine';
import { NEWSLETTER_SIGNUP_URL } from '../../../config/newsletter';
import { treeBudgetQuery, useTreeBudget } from '../../../hooks/useTreeBudget';
import { useAuthStore } from '../../../stores/authStore';
import { SettingsCardsSkeleton } from '../components/SettingsSkeleton';

export const prefetch = (queryClient: QueryClient) => {
  void queryClient.prefetchQuery(treeBudgetQuery(useAuthStore.getState().user?.id));
};

const COST_ITEMS = [
  '1 KI-Bild (kleines Modell 0,5 · großes Modell 2)',
  '3 Minuten Sprachausgabe',
  '20.000 Zeichen Übersetzung (ein Dokument 2,5)',
  '1 Tiefenrecherche',
];

function Tile({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-grey-200 bg-background p-md dark:border-grey-700">
      {children}
    </div>
  );
}

export default function TreesTab() {
  const { data, isPending, isError } = useTreeBudget();

  if (isPending) return <SettingsCardsSkeleton cards={2} />;

  if (isError || !data) {
    return (
      <p className="m-0 text-sm text-grey-500">
        Dein Bäume-Kontingent konnte nicht geladen werden. Bitte versuche es später erneut.
      </p>
    );
  }

  const { used, limit, remaining, resetsAt, newsletterBonus } = data;
  const resetTime = new Date(resetsAt).toLocaleTimeString('de-DE', {
    hour: '2-digit',
    minute: '2-digit',
  });
  const showNewsletterCard = limit !== null && !newsletterBonus;

  return (
    <div className="flex flex-col gap-lg">
      <Tile>
        {limit === null ? (
          <span className="text-xl font-semibold text-foreground-heading">Unbegrenzt</span>
        ) : (
          <>
            <span className="text-xl font-semibold text-foreground-heading">
              {formatTrees(remaining ?? Math.max(limit - used, 0))} von {formatTrees(limit)} Bäumen
            </span>
            <div
              role="progressbar"
              aria-label="Verbrauchtes Bäume-Kontingent heute"
              aria-valuenow={used}
              aria-valuemin={0}
              aria-valuemax={limit}
              className="h-2 w-full overflow-hidden rounded-full bg-grey-200 dark:bg-grey-700"
            >
              <div
                className="h-full rounded-full bg-primary"
                style={{ width: `${Math.min(100, Math.round((used / limit) * 100))}%` }}
              />
            </div>
          </>
        )}
        <span className="text-xs text-grey-500">
          {limit === null ? 'Unbegrenzt auf dieser Instanz.' : `Neu um ${resetTime} Uhr.`}
        </span>
        {newsletterBonus && (
          <span className="text-xs text-grey-500">
            Inklusive 5 Bäume durch dein Newsletter-Abo.
          </span>
        )}
      </Tile>

      <section className="flex flex-col gap-sm">
        <h3 className="m-0 text-sm font-semibold text-foreground-heading">Was ein Baum ist</h3>
        <ul className="m-0 flex list-none flex-col gap-1 p-0 text-sm text-grey-500">
          {COST_ITEMS.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>

      {showNewsletterCard && (
        <section className="flex flex-col gap-sm rounded-xl border border-grey-200 p-md dark:border-grey-700">
          <h3 className="m-0 text-sm font-semibold text-foreground-heading">
            5 Bäume mehr pro Tag
          </h3>
          <p className="m-0 text-sm text-grey-500">
            Wer den Grünerator-Newsletter abonniert hat, bekommt täglich 15 statt 10 Bäume.
          </p>
          <div>
            <Button asChild variant="brand">
              <a href={NEWSLETTER_SIGNUP_URL} target="_blank" rel="noreferrer">
                Newsletter abonnieren
              </a>
            </Button>
          </div>
          <p className="m-0 text-xs text-grey-500">
            Zählt für die E-Mail-Adresse deines Grünerator-Kontos.
          </p>
        </section>
      )}
    </div>
  );
}
